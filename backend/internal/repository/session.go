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

// Create stores a new session and returns its id.
func (r *SessionRepository) Create(ctx context.Context, userID int64, refreshTokenHash string, expiresAt time.Time) (string, error) {
	var sid string
	err := r.db.QueryRow(ctx,
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
