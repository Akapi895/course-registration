package controller

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

// ServeFrontend mounts the Vite build alongside the API for a single-service demo.
// The frontend uses hash routes, so API and unknown paths need no HTML fallback.
func ServeFrontend(r *gin.Engine, dir string) error {
	index := filepath.Join(dir, "index.html")
	info, err := os.Stat(index)
	if err != nil {
		return fmt.Errorf("load frontend build: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("frontend index must be a file: %s", index)
	}
	r.Match([]string{"GET", "HEAD"}, "/", func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		c.File(index)
	})
	r.Static("/assets", filepath.Join(dir, "assets"))
	r.StaticFile("/favicon.svg", filepath.Join(dir, "favicon.svg"))
	return nil
}
