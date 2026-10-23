package repository

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrDuplicate        = errors.New("duplicate")
	ErrInvalidReference = errors.New("invalid reference")
)

// translateError maps PostgreSQL constraint violations to repository errors.
func translateError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return ErrDuplicate
		case "23503":
			return ErrInvalidReference
		}
	}
	return err
}
