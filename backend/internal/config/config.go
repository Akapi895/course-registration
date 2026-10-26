package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Port          string
	DatabaseURL   string
	JWTSecret     string
	JWTTTL        time.Duration
	AdminJWTTTL   time.Duration
	SessionTTL    time.Duration
	LoginCooldown time.Duration
	FrontendDir   string
	MaxCredits    int
}

// Load reads the settings from the environment. A .env file in the current or
// parent directory fills in values that are not already set.
func Load() (*Config, error) {
	loadDotEnv()

	var problems []string
	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		FrontendDir: os.Getenv("FRONTEND_DIR"),
	}

	if cfg.DatabaseURL == "" {
		problems = append(problems, "DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		problems = append(problems, "JWT_SECRET is required")
	}

	var err error
	if cfg.JWTTTL, err = getDuration("JWT_TTL", 20*time.Minute); err != nil {
		problems = append(problems, err.Error())
	}
	if cfg.AdminJWTTTL, err = getDuration("ADMIN_JWT_TTL", 8*time.Hour); err != nil {
		problems = append(problems, err.Error())
	}
	if cfg.SessionTTL, err = getDuration("SESSION_TTL", cfg.JWTTTL); err != nil {
		problems = append(problems, err.Error())
	}
	if cfg.LoginCooldown, err = getDuration("LOGIN_COOLDOWN", 20*time.Minute); err != nil {
		problems = append(problems, err.Error())
	}
	if value := os.Getenv("MAX_CREDITS"); value != "" {
		limit, parseErr := strconv.ParseInt(value, 10, 32)
		if parseErr != nil || limit <= 0 {
			problems = append(problems, "MAX_CREDITS must be a positive integer up to 2147483647")
		} else {
			cfg.MaxCredits = int(limit)
		}
	}
	if len(problems) == 0 && cfg.SessionTTL != cfg.JWTTTL {
		problems = append(problems, "SESSION_TTL must equal JWT_TTL because sessions and tokens share one expiry")
	}
	if len(problems) == 0 && cfg.JWTTTL < time.Second {
		problems = append(problems, "JWT_TTL must be at least 1s")
	}
	if len(problems) == 0 && cfg.AdminJWTTTL < time.Second {
		problems = append(problems, "ADMIN_JWT_TTL must be at least 1s")
	}

	if len(problems) > 0 {
		return nil, errors.New("invalid configuration: " + strings.Join(problems, "; "))
	}
	return cfg, nil
}

func loadDotEnv() {
	for _, path := range []string{".env", "../.env"} {
		if _, err := os.Stat(path); err == nil {
			_ = godotenv.Load(path)
			return
		}
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getDuration(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration such as 1h or 30m", key)
	}
	return d, nil
}
