package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func NewRouter(
	auth *service.AuthService,
	classes *service.ClassService,
	registrations *service.RegistrationService,
	periods *service.RegistrationPeriodService,
) *gin.Engine {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		success(c, 200, gin.H{})
	})
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	authCtl := NewAuthController(auth)
	classCtl := NewClassController(classes)
	registrationCtl := NewRegistrationController(registrations)
	scheduleCtl := NewScheduleController(registrations)
	periodCtl := NewRegistrationPeriodController(periods)

	api := r.Group("/api")
	api.POST("/auth/login", authCtl.Login)

	protected := api.Group("", AuthRequired(auth))
	protected.POST("/auth/logout", authCtl.Logout)
	protected.GET("/auth/me", authCtl.Me)
	protected.GET("/classes", classCtl.List)
	protected.POST("/classes", classCtl.Create)
	protected.GET("/classes/:id", classCtl.Get)
	protected.PUT("/classes/:id", classCtl.Update)
	protected.DELETE("/classes/:id", classCtl.Cancel)
	protected.POST("/registrations", registrationCtl.Register)
	protected.GET("/registrations", registrationCtl.List)
	protected.DELETE("/registrations/:id", registrationCtl.Cancel)
	protected.GET("/schedules", scheduleCtl.List)
	protected.PUT("/registration-period", periodCtl.Update)

	return r
}
