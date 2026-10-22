package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds the application settings read from environment variables.
type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	JWTTTL      time.Duration
	SessionTTL  time.Duration
}

// Load reads the settings from the environment and validates them.
// For local development it first loads a .env file if one exists; variables
// already set in the environment take precedence over the file.
func Load() (*Config, error) {
	loadDotEnv()

	var problems []string

	cfg := &Config{
		Port:        getEnv("PORT", "8080"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
	}

	if cfg.DatabaseURL == "" {
		problems = append(problems, "DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		problems = append(problems, "JWT_SECRET is required")
	}

	var err error
	if cfg.JWTTTL, err = getDuration("JWT_TTL", time.Hour); err != nil {
		problems = append(problems, err.Error())
	}
	if cfg.SessionTTL, err = getDuration("SESSION_TTL", 24*time.Hour); err != nil {
		problems = append(problems, err.Error())
	}
	if len(problems) == 0 && cfg.SessionTTL < cfg.JWTTTL {
		problems = append(problems, "SESSION_TTL must not be shorter than JWT_TTL")
	}

	if len(problems) > 0 {
		return nil, errors.New("invalid configuration: " + strings.Join(problems, "; "))
	}
	return cfg, nil
}

// loadDotEnv looks for .env in the current directory, then in the parent
// directory, so it works when run from backend/ or from the repository root.
// A missing file is not an error.
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
