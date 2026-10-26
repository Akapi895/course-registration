package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionRepository struct {
	db *pgxpool.Pool
}

func NewSessionRepository(db *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{db: db}
}

// WithTx keeps the account lock, previous-window lookup and session write atomic.
func (r *SessionRepository) WithTx(ctx context.Context, fn func(*SessionTx) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(&SessionTx{tx: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type SessionTx struct {
	tx pgx.Tx
}

func (t *SessionTx) LockUser(ctx context.Context, userID int64) (bool, error) {
	var id int64
	err := t.tx.QueryRow(ctx, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// LatestExpiry includes revoked sessions: logout must not erase the login window.
// Each row is capped at created_at + ttl so windows stored under a longer TTL
// cannot extend a login, and the maximum is taken after capping.
func (t *SessionTx) LatestExpiry(ctx context.Context, userID int64, ttl time.Duration) (*time.Time, error) {
	var expiresAt *time.Time
	err := t.tx.QueryRow(ctx,
		`SELECT MAX(LEAST(expires_at, created_at + make_interval(secs => $2)))
		 FROM auth_sessions WHERE user_id = $1`,
		userID, ttl.Seconds(),
	).Scan(&expiresAt)
	if err != nil {
		return nil, err
	}
	return expiresAt, nil
}

func (t *SessionTx) Create(ctx context.Context, userID int64, refreshTokenHash string, createdAt, expiresAt time.Time) (string, error) {
	var sid string
	err := t.tx.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, created_at, expires_at)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id::text`,
		userID, refreshTokenHash, createdAt, expiresAt,
	).Scan(&sid)
	return sid, err
}

// ActiveSession is an unrevoked, unexpired session row.
type ActiveSession struct {
	UserID    int64
	CreatedAt time.Time
	ExpiresAt time.Time
}

// Active returns the session when it is unrevoked and unexpired, or nil otherwise.
func (r *SessionRepository) Active(ctx context.Context, sid string) (*ActiveSession, error) {
	var session ActiveSession
	err := r.db.QueryRow(ctx,
		`SELECT user_id, created_at, expires_at FROM auth_sessions
		 WHERE id = $1::uuid AND revoked_at IS NULL AND expires_at > now()`,
		sid,
	).Scan(&session.UserID, &session.CreatedAt, &session.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *SessionRepository) Revoke(ctx context.Context, sid string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = now()
		 WHERE id = $1::uuid AND revoked_at IS NULL`,
		sid,
	)
	return err
}
