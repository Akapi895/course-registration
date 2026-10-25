package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFrontendSharesOriginWithoutReplacingAPIRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{
		"index.html":    "<html>demo frontend</html>",
		"assets/app.js": "console.log('demo')",
		"favicon.svg":   "<svg></svg>",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	r := NewRouter(nil, nil, nil, nil)
	if err := ServeFrontend(r, dir); err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		path   string
		status int
		body   string
	}{
		{"/", 200, "demo frontend"},
		{"/assets/app.js", 200, "console.log"},
		{"/favicon.svg", 200, "<svg>"},
		{"/health", 200, `"status":"success"`},
		{"/api/classes", 401, "UNAUTHORIZED"},
		{"/api/unknown", 404, "404"},
		{"/assets/missing.js", 404, ""},
	} {
		t.Run(tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.path, nil))
			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), tt.body) {
				t.Fatalf("got %d %s; want %d containing %q", rec.Code, rec.Body, tt.status, tt.body)
			}
		})
	}
}

func TestFrontendRequiresExistingBuild(t *testing.T) {
	gin.SetMode(gin.TestMode)
	if err := ServeFrontend(gin.New(), t.TempDir()); err == nil {
		t.Fatal("missing frontend build must fail startup")
	}
}
