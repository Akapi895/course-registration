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

type failure struct {
	err     error
	status  int
	code    string
	message string
}

var failures = []failure{
	{service.ErrInvalidCredentials, 401, "INVALID_CREDENTIALS", "Sai tên đăng nhập hoặc mật khẩu"},
	{service.ErrSessionRevoked, 401, "SESSION_REVOKED", "Phiên đăng nhập đã bị thu hồi hoặc đã hết hạn"},
	{service.ErrUnauthorized, 401, "UNAUTHORIZED", "Chưa đăng nhập hoặc phiên không hợp lệ"},
	{service.ErrForbidden, 403, "FORBIDDEN", "Bạn không có quyền truy cập dữ liệu này"},
	{service.ErrNotFound, 404, "NOT_FOUND", "Không tìm thấy dữ liệu"},
	{service.ErrClassCancelled, 409, "CLASS_CANCELLED", "Lớp học phần đã bị hủy"},
	{service.ErrClassFull, 409, "CLASS_FULL", "Lớp học phần đã đủ sĩ số"},
	{service.ErrRegistrationClosed, 409, "REGISTRATION_CLOSED", "Ngoài thời gian đăng ký"},
	{service.ErrAlreadyRegistered, 409, "ALREADY_REGISTERED", "Bạn đã đăng ký lớp học phần này"},
	{service.ErrScheduleConflict, 409, "SCHEDULE_CONFLICT", "Lớp bị trùng lịch với học phần đã đăng ký"},
	{service.ErrPrerequisiteNotMet, 409, "PREREQUISITE_NOT_MET", "Chưa đạt học phần tiên quyết"},
	{service.ErrCreditLimitExceeded, 409, "CREDIT_LIMIT_EXCEEDED", "Vượt quá số tín chỉ tối đa của học kỳ"},
	{service.ErrRegistrationNotActive, 409, "REGISTRATION_NOT_ACTIVE", "Đăng ký không ở trạng thái đã đăng ký"},
	{service.ErrRegistrationNotFound, 404, "NOT_FOUND", "Không tìm thấy đăng ký của bạn"},
}

func success(c *gin.Context, status int, data any) {
	c.JSON(status, successResponse{Status: "success", Data: data})
}

func fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, failResponse{Status: "fail", Data: failData{Code: code, Message: message}})
}

func failWithError(c *gin.Context, err error) {
	for _, f := range failures {
		if errors.Is(err, f.err) {
			fail(c, f.status, f.code, f.message)
			return
		}
	}
	log.Printf("internal error: %v", err)
	fail(c, 500, "INTERNAL_ERROR", "Lỗi hệ thống")
}
