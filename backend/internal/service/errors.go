package service

import "errors"

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrSessionRevoked     = errors.New("session revoked")
	ErrForbidden          = errors.New("forbidden")
	ErrNotFound           = errors.New("not found")
)
