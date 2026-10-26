package service

import (
	"context"
	"encoding/hex"
	"math"
	"strconv"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/config"
	"github.com/Akapi895/course-registration/backend/internal/repository"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type tokenClaims struct {
	Role string `json:"role"`
	SID  string `json:"sid"`
	jwt.RegisteredClaims
}

type AuthService struct {
	cfg      *config.Config
	users    *repository.UserRepository
	sessions *repository.SessionRepository
}

func NewAuthService(cfg *config.Config, users *repository.UserRepository, sessions *repository.SessionRepository) *AuthService {
	return &AuthService{cfg: cfg, users: users, sessions: sessions}
}

func (s *AuthService) Login(ctx context.Context, username, password string) (string, error) {
	user, err := s.users.FindByUsername(ctx, username)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", ErrInvalidCredentials
	}

	var token string
	err = s.sessions.WithTx(ctx, func(tx *repository.SessionTx) error {
		currentUser, err := tx.LockUser(ctx, user.ID)
		if err != nil {
			return err
		}
		if currentUser == nil || currentUser.PasswordHash != user.PasswordHash {
			return ErrInvalidCredentials
		}
		// Admins may hold several sessions at once, have no login cooldown and
		// use their own token lifetime.
		isAdmin := currentUser.Role == repository.RoleAdmin
		var previous *repository.Session
		if !isAdmin {
			if previous, err = tx.Latest(ctx, user.ID); err != nil {
				return err
			}
		}
		// Keep microseconds for ordering sessions even after a very short cooldown.
		// Read time after the account lock; another login may have held it.
		now := time.Now().UTC()
		createdAt := now.Truncate(time.Microsecond)
		ttl := s.cfg.JWTTTL
		if isAdmin {
			ttl = s.cfg.AdminJWTTTL
		}
		expiresAt := createdAt.Add(ttl)
		if previous != nil {
			if previous.LoggedOutAt == nil && now.Before(previous.ExpiresAt) {
				return ErrAlreadyLoggedIn
			}
			endedAt := previous.ExpiresAt
			if previous.LoggedOutAt != nil {
				endedAt = *previous.LoggedOutAt
			}
			if allowedAt := endedAt.Add(s.cfg.LoginCooldown); now.Before(allowedAt) {
				return &LoginCooldownError{
					LoginAllowedAt: allowedAt,
					RetryAfter:     int(math.Ceil(allowedAt.Sub(now).Seconds())),
				}
			}
		}
		sid, err := tx.Create(ctx, user.ID, createdAt, expiresAt)
		if err != nil {
			return err
		}
		claims := tokenClaims{
			Role: currentUser.Role,
			SID:  sid,
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   strconv.FormatInt(user.ID, 10),
				IssuedAt:  jwt.NewNumericDate(createdAt),
				ExpiresAt: jwt.NewNumericDate(expiresAt),
			},
		}
		token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
		return err
	})
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *AuthService) Logout(ctx context.Context, sid string) error {
	return s.sessions.Logout(ctx, sid, time.Now().UTC())
}

func (s *AuthService) Me(ctx context.Context, userID int64) (*repository.User, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUnauthorized
	}
	return user, nil
}

// VerifyAccessToken checks the stored session and current account role on every
// protected request. An ended session returns ErrSessionRevoked.
func (s *AuthService) VerifyAccessToken(ctx context.Context, token string) (*Principal, error) {
	// Use the same clock for JWTs and sessions, including host-run development.
	now := time.Now().UTC()
	// Preserve JSON types so timestamps must be numbers, not numeric strings.
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return []byte(s.cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired(), jwt.WithIssuedAt(),
		jwt.WithTimeFunc(func() time.Time { return now }))
	if err != nil || !parsed.Valid {
		return nil, ErrUnauthorized
	}

	subject, err := claims.GetSubject()
	if err != nil {
		return nil, ErrUnauthorized
	}
	userID, err := strconv.ParseInt(subject, 10, 64)
	if err != nil || userID <= 0 || strconv.FormatInt(userID, 10) != subject {
		return nil, ErrUnauthorized
	}
	role, ok := claims["role"].(string)
	if !ok || (role != repository.RoleStudent && role != repository.RoleAdmin) {
		return nil, ErrUnauthorized
	}
	sid, ok := claims["sid"].(string)
	if !ok || len(sid) != 36 || sid[8] != '-' || sid[13] != '-' || sid[18] != '-' || sid[23] != '-' {
		return nil, ErrUnauthorized
	}
	if _, err := hex.DecodeString(sid[:8] + sid[9:13] + sid[14:18] + sid[19:23] + sid[24:]); err != nil {
		return nil, ErrUnauthorized
	}
	iat, err := claims.GetIssuedAt()
	if err != nil || iat == nil {
		return nil, ErrUnauthorized
	}
	exp, err := claims.GetExpirationTime()
	if err != nil || exp == nil || !iat.Before(exp.Time) {
		return nil, ErrUnauthorized
	}

	session, err := s.sessions.Active(ctx, sid, now)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, ErrSessionRevoked
	}
	if session.UserID != userID || session.Role != role {
		return nil, ErrUnauthorized
	}
	if exp.Unix() != session.ExpiresAt.Unix() || iat.Unix() != session.CreatedAt.Unix() {
		return nil, ErrUnauthorized
	}
	return &Principal{UserID: session.UserID, Role: role, SID: sid}, nil
}
