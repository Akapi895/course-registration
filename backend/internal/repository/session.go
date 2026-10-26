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

// WithTx keeps the account lock, latest-session lookup and session write atomic.
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

func (t *SessionTx) LockUser(ctx context.Context, userID int64) (*User, error) {
	return scanUser(t.tx.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1 FOR UPDATE`, userID))
}

type Session struct {
	UserID      int64
	CreatedAt   time.Time
	ExpiresAt   time.Time
	LoggedOutAt *time.Time
}

// Latest includes ended sessions because their actual end determines cooldown.
// Call only after locking the account in the same transaction.
func (t *SessionTx) Latest(ctx context.Context, userID int64) (*Session, error) {
	var session Session
	err := t.tx.QueryRow(ctx,
		`SELECT user_id, created_at, expires_at, logged_out_at
		 FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
		userID,
	).Scan(&session.UserID, &session.CreatedAt, &session.ExpiresAt, &session.LoggedOutAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (t *SessionTx) Create(ctx context.Context, userID int64, createdAt, expiresAt time.Time) (string, error) {
	var sid string
	err := t.tx.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, created_at, expires_at)
		 VALUES ($1, $2, $3)
		 RETURNING id::text`,
		userID, createdAt, expiresAt,
	).Scan(&sid)
	return sid, err
}

// ActiveSession includes the account's current role for token authorization.
type ActiveSession struct {
	UserID    int64
	CreatedAt time.Time
	ExpiresAt time.Time
	Role      string
}

// Active returns the session when it is not logged out or expired, or nil otherwise.
func (r *SessionRepository) Active(ctx context.Context, sid string, now time.Time) (*ActiveSession, error) {
	var session ActiveSession
	err := r.db.QueryRow(ctx,
		`SELECT s.user_id, s.created_at, s.expires_at, u.role
		 FROM auth_sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1::uuid AND s.logged_out_at IS NULL AND s.expires_at > $2`,
		sid, now,
	).Scan(&session.UserID, &session.CreatedAt, &session.ExpiresAt, &session.Role)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func (r *SessionRepository) Logout(ctx context.Context, sid string, now time.Time) error {
	_, err := r.db.Exec(ctx,
		`UPDATE auth_sessions SET logged_out_at = $2
		 WHERE id = $1::uuid AND logged_out_at IS NULL AND expires_at > $2`,
		sid, now,
	)
	return err
}
