package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	RoleStudent = "student"
	RoleAdmin   = "admin"
)

const userColumns = `id, username, password_hash, role, full_name, student_code, faculty, major`

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
	return r.queryOne(ctx, `SELECT `+userColumns+` FROM users WHERE username = $1`, username)
}

// FindByID returns nil, nil when no user matches.
func (r *UserRepository) FindByID(ctx context.Context, id int64) (*User, error) {
	return r.queryOne(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
}

func (r *UserRepository) queryOne(ctx context.Context, query string, args ...any) (*User, error) {
	var u User
	err := r.db.QueryRow(ctx, query, args...).Scan(
		&u.ID, &u.Username, &u.PasswordHash, &u.Role, &u.FullName,
		&u.StudentCode, &u.Faculty, &u.Major,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
