// @title           Course Registration API
// @version         1.0
// @description     API quản lý và đăng ký học phần (Phase 1). Đăng nhập tại POST /api/auth/login, rồi bấm Authorize và nhập "Bearer <access_token>".
// @BasePath        /
// @securityDefinitions.apikey BearerAuth
// @in              header
// @name            Authorization
// @description     Nhập đúng dạng "Bearer <access_token>": có chữ Bearer, một khoảng trắng, rồi token.
package main

import (
	"context"
	"log"

	_ "github.com/Akapi895/course-registration/backend/docs"
	"github.com/Akapi895/course-registration/backend/internal/config"
	"github.com/Akapi895/course-registration/backend/internal/controller"
	"github.com/Akapi895/course-registration/backend/internal/repository"
	"github.com/Akapi895/course-registration/backend/internal/service"
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

	users := repository.NewUserRepository(pool)
	sessions := repository.NewSessionRepository(pool)
	semesters := repository.NewSemesterRepository(pool)
	classes := repository.NewClassRepository(pool)
	registrations := repository.NewRegistrationRepository(pool)

	auth := service.NewAuthService(cfg, users, sessions)
	classService := service.NewClassService(classes, semesters, cfg.MaxCredits)
	registrationService := service.NewRegistrationService(registrations, classes, semesters, cfg.MaxCredits)
	periods := service.NewRegistrationPeriodService(semesters)

	r := controller.NewRouter(auth, classService, registrationService, periods)
	if cfg.FrontendDir != "" {
		if err := controller.ServeFrontend(r, cfg.FrontendDir); err != nil {
			log.Fatal(err)
		}
	}
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
