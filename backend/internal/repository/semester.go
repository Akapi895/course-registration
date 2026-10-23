package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Semester struct {
	ID                   int64
	RegistrationOpensAt  time.Time
	RegistrationClosesAt time.Time
}

type SemesterRepository struct {
	db *pgxpool.Pool
}

func NewSemesterRepository(db *pgxpool.Pool) *SemesterRepository {
	return &SemesterRepository{db: db}
}

// FindCurrent returns the latest semester whose registration has opened by now,
// or nil when none has opened yet.
func (r *SemesterRepository) FindCurrent(ctx context.Context, now time.Time) (*Semester, error) {
	return r.queryOne(ctx,
		`SELECT id, registration_opens_at, registration_closes_at
		 FROM semesters
		 WHERE registration_opens_at <= $1
		 ORDER BY registration_opens_at DESC
		 LIMIT 1`,
		now,
	)
}

func (r *SemesterRepository) FindByID(ctx context.Context, id int64) (*Semester, error) {
	return r.queryOne(ctx,
		`SELECT id, registration_opens_at, registration_closes_at
		 FROM semesters WHERE id = $1`,
		id,
	)
}

func (r *SemesterRepository) queryOne(ctx context.Context, query string, args ...any) (*Semester, error) {
	var s Semester
	err := r.db.QueryRow(ctx, query, args...).Scan(&s.ID, &s.RegistrationOpensAt, &s.RegistrationClosesAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}
