package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func NewRouter(
	auth *service.AuthService,
	students *service.StudentService,
	classes *service.ClassService,
	registrations *service.RegistrationService,
) *gin.Engine {
	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		success(c, 200, gin.H{})
	})
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	authCtl := NewAuthController(auth)
	studentCtl := NewStudentController(students)
	classCtl := NewClassController(classes)
	registrationCtl := NewRegistrationController(registrations)
	scheduleCtl := NewScheduleController(registrations)

	api := r.Group("/api")
	api.POST("/auth/login", authCtl.Login)

	protected := api.Group("", AuthRequired(auth))
	protected.POST("/auth/logout", authCtl.Logout)
	protected.GET("/auth/me", authCtl.Me)
	protected.GET("/students/:id", studentCtl.Get)
	protected.PUT("/students/:id", studentCtl.Update)
	protected.GET("/classes", classCtl.List)
	protected.GET("/classes/:id", classCtl.Get)
	protected.POST("/registrations", registrationCtl.Register)
	protected.GET("/registrations", registrationCtl.List)
	protected.DELETE("/registrations/:id", registrationCtl.Cancel)
	protected.GET("/schedules", scheduleCtl.List)

	return r
}
