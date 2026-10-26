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
func (t *SessionTx) LatestExpiry(ctx context.Context, userID int64) (*time.Time, error) {
	var expiresAt time.Time
	err := t.tx.QueryRow(ctx,
		`SELECT expires_at FROM auth_sessions WHERE user_id = $1 ORDER BY expires_at DESC LIMIT 1`,
		userID,
	).Scan(&expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &expiresAt, nil
}

func (t *SessionTx) Create(ctx context.Context, userID int64, refreshTokenHash string, expiresAt time.Time) (string, error) {
	var sid string
	err := t.tx.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at)
		 VALUES ($1, $2, $3)
		 RETURNING id::text`,
		userID, refreshTokenHash, expiresAt,
	).Scan(&sid)
	return sid, err
}

// ActiveOwner returns the user id of an unrevoked, unexpired session.
// It returns 0 when the session is not active.
func (r *SessionRepository) ActiveOwner(ctx context.Context, sid string) (int64, error) {
	var userID int64
	err := r.db.QueryRow(ctx,
		`SELECT user_id FROM auth_sessions
		 WHERE id = $1::uuid AND revoked_at IS NULL AND expires_at > now()`,
		sid,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return userID, err
}

func (r *SessionRepository) Revoke(ctx context.Context, sid string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE auth_sessions SET revoked_at = now()
		 WHERE id = $1::uuid AND revoked_at IS NULL`,
		sid,
	)
	return err
}
