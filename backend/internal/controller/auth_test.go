package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/config"
	"github.com/Akapi895/course-registration/backend/internal/repository"
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type authReply struct {
	Status string `json:"status"`
	Data   struct {
		AccessToken    string    `json:"access_token"`
		Code           string    `json:"code"`
		Message        string    `json:"message"`
		Role           string    `json:"role"`
		RetryAfter     int       `json:"retry_after"`
		LoginAllowedAt time.Time `json:"login_allowed_at"`
	} `json:"data"`
}

type authHarness struct {
	db     *pgxpool.Pool
	router http.Handler
	cfg    *config.Config
}

// TEST_DATABASE_URL enables real PostgreSQL tests. Each test owns a disposable
// schema, so it never changes the application's tables or fixture sessions.
func newAuthHarness(t *testing.T) *authHarness {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run auth API tests with PostgreSQL")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	schema := pgx.Identifier{fmt.Sprintf("auth_test_%d", time.Now().UnixNano())}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
	})
	poolConfig, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	poolConfig.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	ddl, err := os.ReadFile("../../../database/migrations/001_initial.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, string(ddl)); err != nil {
		t.Fatal(err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("test-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO users (username, password_hash, role, full_name, student_code)
		VALUES ('student', $1, 'student', 'Test Student', 'TEST001'),
		       ('admin', $1, 'admin', 'Test Admin', NULL)`, string(hash)); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{JWTSecret: "auth-integration-test-secret", JWTTTL: 2 * time.Minute, SessionTTL: 2 * time.Minute, LoginCooldown: 30 * time.Second}
	users := repository.NewUserRepository(db)
	sessions := repository.NewSessionRepository(db)
	classes := repository.NewClassRepository(db)
	semesters := repository.NewSemesterRepository(db)
	registrations := repository.NewRegistrationRepository(db)
	gin.SetMode(gin.TestMode)
	router := NewRouter(service.NewAuthService(cfg, users, sessions),
		service.NewClassService(classes, semesters, 0),
		service.NewRegistrationService(registrations, classes, semesters, 0))
	return &authHarness{db: db, router: router, cfg: cfg}
}

func (h *authHarness) request(t *testing.T, method, path, token string, body any) (*httptest.ResponseRecorder, authReply) {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	var reply authReply
	if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
		t.Fatalf("decode response: %v; body %s", err, rec.Body)
	}
	return rec, reply
}

func (h *authHarness) login(t *testing.T, username string) (*httptest.ResponseRecorder, authReply) {
	t.Helper()
	return h.request(t, http.MethodPost, "/api/auth/login", "", map[string]string{"username": username, "password": "test-password"})
}

func TestAuthRejectsActiveSessionLogin(t *testing.T) {
	h := newAuthHarness(t)
	first, reply := h.login(t, "student")
	if first.Code != http.StatusOK || reply.Data.AccessToken == "" {
		t.Fatalf("first login: %d %s", first.Code, first.Body)
	}
	token := reply.Data.AccessToken
	var envelope struct {
		Data map[string]json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if len(envelope.Data) != 1 || envelope.Data["access_token"] == nil {
		t.Fatalf("unexpected login payload: %s", first.Body)
	}
	claims := authClaims(t, token)
	if claims["exp"].(float64)-claims["iat"].(float64) != 120 {
		t.Fatalf("JWT lifetime is not the configured two minutes: %v", claims)
	}
	second, reply := h.login(t, "student")
	if second.Code != http.StatusConflict || reply.Data.Code != "ALREADY_LOGGED_IN" {
		t.Fatalf("active-session login: %d %s", second.Code, second.Body)
	}
	me, _ := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
	if me.Code != http.StatusOK {
		t.Fatalf("original session changed: %d %s", me.Code, me.Body)
	}
}

func TestAuthRejectsStaleRole(t *testing.T) {
	h := newAuthHarness(t)
	login, reply := h.login(t, "student")
	if login.Code != http.StatusOK {
		t.Fatal(login.Body)
	}
	if _, err := h.db.Exec(context.Background(), `UPDATE users SET role = 'admin', student_code = NULL WHERE username = 'student'`); err != nil {
		t.Fatal(err)
	}
	me, reply := h.request(t, http.MethodGet, "/api/auth/me", reply.Data.AccessToken, nil)
	if me.Code != http.StatusUnauthorized || reply.Data.Code != "UNAUTHORIZED" {
		t.Fatalf("stale role: %d %s", me.Code, me.Body)
	}
}

func authClaims(t *testing.T, token string) jwt.MapClaims {
	t.Helper()
	claims := jwt.MapClaims{}
	if _, _, err := jwt.NewParser().ParseUnverified(token, claims); err != nil {
		t.Fatal(err)
	}
	return claims
}

func TestAuthValidatesTokenClaims(t *testing.T) {
	h := newAuthHarness(t)
	login, reply := h.login(t, "student")
	if login.Code != http.StatusOK {
		t.Fatal(login.Body)
	}
	original := reply.Data.AccessToken
	tests := []struct {
		name   string
		change func(jwt.MapClaims)
	}{
		{"missing iat", func(c jwt.MapClaims) { delete(c, "iat") }},
		{"null iat", func(c jwt.MapClaims) { c["iat"] = nil }},
		{"string iat", func(c jwt.MapClaims) { c["iat"] = "123" }},
		{"future iat", func(c jwt.MapClaims) { c["iat"] = time.Now().Add(time.Minute).Unix() }},
		{"iat differs from session", func(c jwt.MapClaims) { c["iat"] = c["iat"].(float64) - 1 }},
		{"missing exp", func(c jwt.MapClaims) { delete(c, "exp") }},
		{"string exp", func(c jwt.MapClaims) { c["exp"] = "9999999999" }},
		{"expired exp", func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Second).Unix() }},
		{"exp differs from session", func(c jwt.MapClaims) { c["exp"] = c["exp"].(float64) + 60 }},
		{"missing sub", func(c jwt.MapClaims) { delete(c, "sub") }},
		{"numeric sub", func(c jwt.MapClaims) { c["sub"] = 1 }},
		{"another account", func(c jwt.MapClaims) { c["sub"] = "2" }},
		{"noncanonical sub", func(c jwt.MapClaims) { c["sub"] = "01" }},
		{"missing role", func(c jwt.MapClaims) { delete(c, "role") }},
		{"invalid role", func(c jwt.MapClaims) { c["role"] = "lecturer" }},
		{"another role", func(c jwt.MapClaims) { c["role"] = "admin" }},
		{"missing sid", func(c jwt.MapClaims) { delete(c, "sid") }},
		{"invalid sid", func(c jwt.MapClaims) { c["sid"] = "not-a-uuid" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims := authClaims(t, original)
			tt.change(claims)
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.cfg.JWTSecret))
			if err != nil {
				t.Fatal(err)
			}
			rec, reply := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
			if rec.Code != http.StatusUnauthorized || reply.Data.Code != "UNAUTHORIZED" {
				t.Fatalf("invalid claim accepted: %d %s", rec.Code, rec.Body)
			}
		})
	}
}

func TestAuthConcurrentLogin(t *testing.T) {
	for _, username := range []string{"student"} {
		t.Run(username, func(t *testing.T) {
			h := newAuthHarness(t)
			const attempts = 12
			start := make(chan struct{})
			responses := make(chan *httptest.ResponseRecorder, attempts)
			body := fmt.Sprintf(`{"username":%q,"password":"test-password"}`, username)
			for range attempts {
				req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(body))
				req.Header.Set("Content-Type", "application/json")
				go func() {
					<-start
					rec := httptest.NewRecorder()
					h.router.ServeHTTP(rec, req)
					responses <- rec
				}()
			}
			close(start)
			var token string
			successes := 0
			for range attempts {
				rec := <-responses
				var reply authReply
				if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
					t.Fatal(err)
				}
				if rec.Code == http.StatusOK {
					successes++
					token = reply.Data.AccessToken
				} else if rec.Code != http.StatusConflict || reply.Data.Code != "ALREADY_LOGGED_IN" {
					t.Errorf("concurrent login: %d %s", rec.Code, rec.Body)
				}
			}
			if successes != 1 {
				t.Fatalf("successful concurrent logins = %d, want 1", successes)
			}
			me, _ := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
			if me.Code != http.StatusOK {
				t.Fatalf("winning session: %d %s", me.Code, me.Body)
			}
		})
	}
}

func TestAuthLogoutCooldown(t *testing.T) {
	for _, username := range []string{"student"} {
		t.Run(username, func(t *testing.T) {
			h := newAuthHarness(t)
			login, reply := h.login(t, username)
			if login.Code != http.StatusOK {
				t.Fatal(login.Body)
			}
			token := reply.Data.AccessToken
			before := time.Now()
			logout, _ := h.request(t, http.MethodPost, "/api/auth/logout", token, nil)
			after := time.Now()
			if logout.Code != http.StatusOK || logout.Body.String() != `{"status":"success","data":{}}` {
				t.Fatalf("logout: %d %s", logout.Code, logout.Body)
			}
			me, reply := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
			if me.Code != http.StatusUnauthorized || reply.Data.Code != "SESSION_REVOKED" {
				t.Fatalf("logged-out token accepted: %d %s", me.Code, me.Body)
			}
			cooldown, reply := h.login(t, username)
			if cooldown.Code != http.StatusTooManyRequests || reply.Data.Code != "LOGIN_COOLDOWN" {
				t.Fatalf("logout cooldown: %d %s", cooldown.Code, cooldown.Body)
			}
			allowedAt := reply.Data.LoginAllowedAt
			if allowedAt.Before(before.Add(h.cfg.LoginCooldown)) || allowedAt.After(after.Add(h.cfg.LoginCooldown)) {
				t.Fatalf("cooldown does not start at logout: %v", allowedAt)
			}
			if reply.Data.RetryAfter <= 0 || cooldown.Header().Get("Retry-After") != strconv.Itoa(reply.Data.RetryAfter) {
				t.Fatalf("inconsistent Retry-After: %s %s", cooldown.Header(), cooldown.Body)
			}
			again, _ := h.request(t, http.MethodPost, "/api/auth/logout", token, nil)
			if again.Code != http.StatusUnauthorized {
				t.Fatalf("repeated logout: %d %s", again.Code, again.Body)
			}
			cooldown, reply = h.login(t, username)
			if cooldown.Code != http.StatusTooManyRequests || !reply.Data.LoginAllowedAt.Equal(allowedAt) {
				t.Fatalf("repeated requests changed cooldown: %d %s", cooldown.Code, cooldown.Body)
			}
		})
	}
}

func TestAuthNaturalExpiryCooldown(t *testing.T) {
	for _, username := range []string{"student"} {
		t.Run(username, func(t *testing.T) {
			h := newAuthHarness(t)
			h.cfg.JWTTTL, h.cfg.SessionTTL, h.cfg.LoginCooldown = time.Second, time.Second, 2*time.Second
			login, reply := h.login(t, username)
			if login.Code != http.StatusOK {
				t.Fatal(login.Body)
			}
			token := reply.Data.AccessToken
			// Wait for the stored microsecond-precision expiry, not just JWT exp.
			time.Sleep(h.cfg.JWTTTL + 20*time.Millisecond)
			logout, reply := h.request(t, http.MethodPost, "/api/auth/logout", token, nil)
			if logout.Code != http.StatusUnauthorized || reply.Data.Code != "UNAUTHORIZED" {
				t.Fatalf("expired token logout: %d %s", logout.Code, logout.Body)
			}
			cooldown, reply := h.login(t, username)
			if cooldown.Code != http.StatusTooManyRequests || reply.Data.Code != "LOGIN_COOLDOWN" {
				t.Fatalf("natural expiry cooldown: %d %s", cooldown.Code, cooldown.Body)
			}
			allowedAt := reply.Data.LoginAllowedAt
			cooldown, reply = h.login(t, username)
			if cooldown.Code != http.StatusTooManyRequests || !reply.Data.LoginAllowedAt.Equal(allowedAt) {
				t.Fatalf("natural expiry cooldown changed: %d %s", cooldown.Code, cooldown.Body)
			}
			time.Sleep(time.Until(allowedAt) + 10*time.Millisecond)
			login, reply = h.login(t, username)
			if login.Code != http.StatusOK || reply.Data.AccessToken == token {
				t.Fatalf("login after natural expiry cooldown: %d %s", login.Code, login.Body)
			}
		})
	}
}

func TestAuthAdminHasNoSessionLimit(t *testing.T) {
	h := newAuthHarness(t)
	first, reply := h.login(t, "admin")
	if first.Code != http.StatusOK {
		t.Fatal(first.Body)
	}
	firstToken := reply.Data.AccessToken
	second, reply := h.login(t, "admin")
	if second.Code != http.StatusOK || reply.Data.AccessToken == firstToken {
		t.Fatalf("second admin login: %d %s", second.Code, second.Body)
	}
	secondToken := reply.Data.AccessToken
	if authClaims(t, firstToken)["sid"] == authClaims(t, secondToken)["sid"] {
		t.Fatal("admin sessions share a sid")
	}
	logout, _ := h.request(t, http.MethodPost, "/api/auth/logout", firstToken, nil)
	if logout.Code != http.StatusOK {
		t.Fatalf("logout: %d %s", logout.Code, logout.Body)
	}
	me, reply := h.request(t, http.MethodGet, "/api/auth/me", firstToken, nil)
	if me.Code != http.StatusUnauthorized || reply.Data.Code != "SESSION_REVOKED" {
		t.Fatalf("logged-out session accepted: %d %s", me.Code, me.Body)
	}
	me, _ = h.request(t, http.MethodGet, "/api/auth/me", secondToken, nil)
	if me.Code != http.StatusOK {
		t.Fatalf("other admin session affected: %d %s", me.Code, me.Body)
	}
	again, _ := h.login(t, "admin")
	if again.Code != http.StatusOK {
		t.Fatalf("admin login right after logout: %d %s", again.Code, again.Body)
	}
}

func TestAuthLoginAfterEarlyLogoutCooldown(t *testing.T) {
	h := newAuthHarness(t)
	h.cfg.LoginCooldown = 50 * time.Millisecond
	login, reply := h.login(t, "student")
	if login.Code != http.StatusOK {
		t.Fatal(login.Body)
	}
	token := reply.Data.AccessToken
	logout, _ := h.request(t, http.MethodPost, "/api/auth/logout", token, nil)
	if logout.Code != http.StatusOK {
		t.Fatal(logout.Body)
	}
	time.Sleep(h.cfg.LoginCooldown + 10*time.Millisecond)
	login, reply = h.login(t, "student")
	if login.Code != http.StatusOK || reply.Data.AccessToken == token {
		t.Fatalf("login after early logout cooldown: %d %s", login.Code, login.Body)
	}
	// Even with two sessions created within the same second, the newest wins.
	rec, reply := h.login(t, "student")
	if rec.Code != http.StatusConflict || reply.Data.Code != "ALREADY_LOGGED_IN" {
		t.Fatalf("latest active session ignored: %d %s", rec.Code, rec.Body)
	}
}

func TestAuthUsesLatestSessionAndStoredExpiry(t *testing.T) {
	h := newAuthHarness(t)
	// An older logged-out session with a long expiry must not extend cooldown.
	if _, err := h.db.Exec(context.Background(), `INSERT INTO auth_sessions (user_id, created_at, expires_at, logged_out_at)
		VALUES (1, now() - interval '2 days', now() + interval '1 day', now() - interval '1 day'),
		       (1, now() - interval '10 minutes', now() - interval '2 minutes', NULL)`); err != nil {
		t.Fatal(err)
	}
	login, reply := h.login(t, "student")
	if login.Code != http.StatusOK {
		t.Fatalf("history blocked login: %d %s", login.Code, login.Body)
	}
	token := reply.Data.AccessToken
	h.cfg.JWTTTL, h.cfg.SessionTTL = time.Second, time.Second
	me, _ := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
	if me.Code != http.StatusOK {
		t.Fatalf("config change invalidated stored lifetime: %d %s", me.Code, me.Body)
	}
}

func TestAuthCredentialAndAuthorizationErrors(t *testing.T) {
	h := newAuthHarness(t)
	login, reply := h.login(t, "admin")
	if login.Code != http.StatusOK {
		t.Fatal(login.Body)
	}
	token := reply.Data.AccessToken
	forbidden, reply := h.request(t, http.MethodGet, "/api/registrations", token, nil)
	if forbidden.Code != http.StatusForbidden || reply.Data.Code != "FORBIDDEN" {
		t.Fatalf("role restriction: %d %s", forbidden.Code, forbidden.Body)
	}
	var wrongPasswordMessage string
	for _, username := range []string{"admin", "unknown"} {
		rec, reply := h.request(t, http.MethodPost, "/api/auth/login", "", map[string]string{"username": username, "password": "wrong"})
		if rec.Code != http.StatusUnauthorized || reply.Data.Code != "INVALID_CREDENTIALS" {
			t.Fatalf("wrong credentials: %d %s", rec.Code, rec.Body)
		}
		if wrongPasswordMessage != "" && reply.Data.Message != wrongPasswordMessage {
			t.Fatalf("unknown username has a different message: %s", rec.Body)
		}
		wrongPasswordMessage = reply.Data.Message
	}
	logout, _ := h.request(t, http.MethodPost, "/api/auth/logout", token, nil)
	if logout.Code != http.StatusOK {
		t.Fatal(logout.Body)
	}
	rec, reply := h.request(t, http.MethodPost, "/api/auth/login", "", map[string]string{"username": "admin", "password": "wrong"})
	if rec.Code != http.StatusUnauthorized || reply.Data.Code != "INVALID_CREDENTIALS" {
		t.Fatalf("cooldown checked before password: %d %s", rec.Code, rec.Body)
	}
}

func TestAuthRejectsInvalidSignaturesAndUnknownSessions(t *testing.T) {
	h := newAuthHarness(t)
	login, reply := h.login(t, "student")
	if login.Code != http.StatusOK {
		t.Fatal(login.Body)
	}
	claims := authClaims(t, reply.Data.AccessToken)
	for _, tt := range []struct {
		name   string
		method jwt.SigningMethod
		key    any
	}{
		{"wrong secret", jwt.SigningMethodHS256, []byte("different-secret")},
		{"wrong algorithm", jwt.SigningMethodHS384, []byte(h.cfg.JWTSecret)},
		{"unsigned token", jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType},
	} {
		t.Run(tt.name, func(t *testing.T) {
			token, err := jwt.NewWithClaims(tt.method, claims).SignedString(tt.key)
			if err != nil {
				t.Fatal(err)
			}
			rec, reply := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
			if rec.Code != http.StatusUnauthorized || reply.Data.Code != "UNAUTHORIZED" {
				t.Fatalf("invalid signature accepted: %d %s", rec.Code, rec.Body)
			}
		})
	}
	claims["sid"] = "11111111-1111-4111-8111-111111111111"
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	rec, reply := h.request(t, http.MethodGet, "/api/auth/me", token, nil)
	if rec.Code != http.StatusUnauthorized || reply.Data.Code != "SESSION_REVOKED" {
		t.Fatalf("unknown session accepted: %d %s", rec.Code, rec.Body)
	}
	rec, reply = h.request(t, http.MethodGet, "/api/auth/me", "", nil)
	if rec.Code != http.StatusUnauthorized || reply.Data.Code != "UNAUTHORIZED" {
		t.Fatalf("missing token accepted: %d %s", rec.Code, rec.Body)
	}
}
