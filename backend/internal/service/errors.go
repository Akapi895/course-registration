package service

import (
	"errors"
	"time"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAlreadyLoggedIn    = errors.New("already logged in")
	ErrLoginCooldown      = errors.New("login cooldown")
	ErrUnauthorized       = errors.New("unauthorized")
	ErrSessionRevoked     = errors.New("session revoked")
	ErrForbidden          = errors.New("forbidden")
	ErrNotFound           = errors.New("not found")

	ErrClassCancelled        = errors.New("class cancelled")
	ErrClassFull             = errors.New("class full")
	ErrRegistrationClosed    = errors.New("registration closed")
	ErrAlreadyRegistered     = errors.New("already registered")
	ErrScheduleConflict      = errors.New("schedule conflict")
	ErrPrerequisiteNotMet    = errors.New("prerequisite not met")
	ErrCreditLimitExceeded   = errors.New("credit limit exceeded")
	ErrRegistrationNotActive = errors.New("registration not active")
	ErrRegistrationNotFound  = errors.New("registration not found")

	ErrClassCodeTaken            = errors.New("class code taken")
	ErrCapacityBelowEnrolled     = errors.New("capacity below enrolled")
	ErrScheduleLocked            = errors.New("schedule locked")
	ErrInvalidReference          = errors.New("invalid reference")
	ErrInvalidSchedule           = errors.New("invalid schedule")
)

type LoginCooldownError struct {
	LoginAllowedAt time.Time
	RetryAfter     int
}

func (e *LoginCooldownError) Error() string { return ErrLoginCooldown.Error() }
func (e *LoginCooldownError) Unwrap() error { return ErrLoginCooldown }
