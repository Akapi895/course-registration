package service

import (
	"testing"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/config"
	"github.com/Akapi895/course-registration/backend/internal/repository"
)

func TestCheckWindow(t *testing.T) {
	svc := &AuthService{cfg: &config.Config{JWTTTL: 20 * time.Minute}}
	created := time.Date(2026, 10, 26, 8, 0, 0, 0, time.UTC)

	tests := []struct {
		name    string
		exp     time.Time
		session repository.ActiveSession
		want    error
	}{
		{
			name:    "new window matches its session",
			exp:     created.Add(20 * time.Minute),
			session: repository.ActiveSession{CreatedAt: created, ExpiresAt: created.Add(20 * time.Minute)},
		},
		{
			name:    "re-login keeps the earlier window end",
			exp:     created.Add(20 * time.Minute),
			session: repository.ActiveSession{CreatedAt: created.Add(5 * time.Minute), ExpiresAt: created.Add(20 * time.Minute)},
		},
		{
			name:    "exp differs from expires_at",
			exp:     created.Add(10 * time.Minute),
			session: repository.ActiveSession{CreatedAt: created, ExpiresAt: created.Add(20 * time.Minute)},
			want:    ErrUnauthorized,
		},
		{
			name:    "legacy 24h window exceeds JWT_TTL",
			exp:     created.Add(24 * time.Hour),
			session: repository.ActiveSession{CreatedAt: created, ExpiresAt: created.Add(24 * time.Hour)},
			want:    ErrSessionRevoked,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := tt.session
			if got := svc.checkWindow(tt.exp, &session); got != tt.want {
				t.Fatalf("checkWindow() = %v, want %v", got, tt.want)
			}
		})
	}
}
