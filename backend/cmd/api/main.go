package main

import (
	"context"
	"log"

	"github.com/Akapi895/course-registration/backend/internal/config"
	"github.com/Akapi895/course-registration/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	pool, err := repository.NewPool(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "success", "data": gin.H{}})
	})

	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
