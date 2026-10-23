package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

	// refresh_token_hash is NOT NULL in the schema but unused in Phase 1.
	placeholder := make([]byte, 32)
	if _, err := rand.Read(placeholder); err != nil {
		return "", err
	}
	placeholderHash := sha256.Sum256(placeholder)

	now := time.Now()
	sid, err := s.sessions.Create(ctx, user.ID, hex.EncodeToString(placeholderHash[:]), now.Add(s.cfg.SessionTTL))
	if err != nil {
		return "", err
	}

	claims := tokenClaims{
		Role: user.Role,
		SID:  sid,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(user.ID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
}

func (s *AuthService) Logout(ctx context.Context, sid string) error {
	return s.sessions.Revoke(ctx, sid)
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

// VerifyAccessToken returns ErrSessionRevoked when the token is valid but its
// session is revoked or expired.
func (s *AuthService) VerifyAccessToken(ctx context.Context, token string) (*Principal, error) {
	claims := &tokenClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return []byte(s.cfg.JWTSecret), nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !parsed.Valid {
		return nil, ErrUnauthorized
	}

	owner, err := s.sessions.ActiveOwner(ctx, claims.SID)
	if err != nil {
		return nil, err
	}
	if owner == 0 {
		return nil, ErrSessionRevoked
	}
	if strconv.FormatInt(owner, 10) != claims.Subject {
		return nil, ErrUnauthorized
	}
	return &Principal{UserID: owner, Role: claims.Role, SID: claims.SID}, nil
}
