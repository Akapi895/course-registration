package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	Role         string
	FullName     string
	StudentCode  *string
	Faculty      *string
	Major        *string
}

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

// FindByUsername returns nil, nil when no user matches.
func (r *UserRepository) FindByUsername(ctx context.Context, username string) (*User, error) {
	return r.findOne(ctx, `WHERE username = $1`, username)
}

// FindByID returns nil, nil when no user matches.
func (r *UserRepository) FindByID(ctx context.Context, id int64) (*User, error) {
	return r.findOne(ctx, `WHERE id = $1`, id)
}

func (r *UserRepository) findOne(ctx context.Context, where string, arg any) (*User, error) {
	var u User
	err := r.db.QueryRow(ctx,
		`SELECT id, username, password_hash, role, full_name, student_code, faculty, major
		 FROM users `+where, arg,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.FullName, &u.StudentCode, &u.Faculty, &u.Major)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
