package controller

import (
	"errors"
	"log"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type successResponse struct {
	Status string `json:"status" example:"success"`
	Data   any    `json:"data"`
}

type failResponse struct {
	Status string   `json:"status" example:"fail"`
	Data   failData `json:"data"`
}

type failData struct {
	Code    string `json:"code" example:"UNAUTHORIZED"`
	Message string `json:"message" example:"Chưa đăng nhập hoặc phiên không hợp lệ"`
}

func success(c *gin.Context, status int, data any) {
	c.JSON(status, successResponse{Status: "success", Data: data})
}

func fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, failResponse{Status: "fail", Data: failData{Code: code, Message: message}})
}

func failWithError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrInvalidCredentials):
		fail(c, 401, "INVALID_CREDENTIALS", "Sai tên đăng nhập hoặc mật khẩu")
	case errors.Is(err, service.ErrSessionRevoked):
		fail(c, 401, "SESSION_REVOKED", "Phiên đăng nhập đã bị thu hồi hoặc đã hết hạn")
	case errors.Is(err, service.ErrUnauthorized):
		fail(c, 401, "UNAUTHORIZED", "Chưa đăng nhập hoặc phiên không hợp lệ")
	default:
		log.Printf("internal error: %v", err)
		fail(c, 500, "INTERNAL_ERROR", "Lỗi hệ thống")
	}
}
