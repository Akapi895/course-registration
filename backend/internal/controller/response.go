package controller

import (
	"errors"
	"log"
	"strconv"
	"time"

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

type loginCooldownData struct {
	Code           string    `json:"code" example:"LOGIN_COOLDOWN"`
	Message        string    `json:"message" example:"Tài khoản đang trong thời gian chờ đăng nhập lại"`
	RetryAfter     int       `json:"retry_after" example:"720"`
	LoginAllowedAt time.Time `json:"login_allowed_at" example:"2026-10-26T03:40:00Z"`
}

type loginCooldownResponse struct {
	Status string            `json:"status" example:"fail"`
	Data   loginCooldownData `json:"data"`
}

type failure struct {
	err     error
	status  int
	code    string
	message string
}

var failures = []failure{
	{service.ErrInvalidCredentials, 401, "INVALID_CREDENTIALS", "Sai tên đăng nhập hoặc mật khẩu"},
	{service.ErrAlreadyLoggedIn, 409, "ALREADY_LOGGED_IN", "Tài khoản đang đăng nhập trên một phiên khác"},
	{service.ErrLoginCooldown, 429, "LOGIN_COOLDOWN", "Tài khoản đang trong thời gian chờ đăng nhập lại"},
	{service.ErrSessionRevoked, 401, "SESSION_REVOKED", "Phiên đăng nhập đã bị thu hồi hoặc đã hết hạn"},
	{service.ErrUnauthorized, 401, "UNAUTHORIZED", "Chưa đăng nhập hoặc phiên không hợp lệ"},
	{service.ErrForbidden, 403, "FORBIDDEN", "Bạn không có quyền truy cập dữ liệu này"},
	{service.ErrNotFound, 404, "NOT_FOUND", "Không tìm thấy dữ liệu"},
	{service.ErrRegistrationNotFound, 404, "NOT_FOUND", "Không tìm thấy đăng ký của bạn"},
	{service.ErrClassCodeTaken, 409, "CONFLICT", "class_code đã tồn tại trong học kỳ"},
	{service.ErrClassCancelled, 409, "CLASS_CANCELLED", "Lớp học phần đã bị hủy"},
	{service.ErrClassFull, 409, "CLASS_FULL", "Lớp học phần đã đủ sĩ số"},
	{service.ErrCapacityBelowEnrolled, 409, "CAPACITY_BELOW_ENROLLED", "max_capacity mới nhỏ hơn số sinh viên đã đăng ký"},
	{service.ErrScheduleLocked, 409, "SCHEDULE_LOCKED", "Không thể sửa lịch học khi lớp đã có sinh viên đăng ký"},
	{service.ErrRegistrationClosed, 409, "REGISTRATION_CLOSED", "Ngoài thời gian đăng ký"},
	{service.ErrAlreadyRegistered, 409, "ALREADY_REGISTERED", "Bạn đã đăng ký lớp học phần này"},
	{service.ErrScheduleConflict, 409, "SCHEDULE_CONFLICT", "Lớp bị trùng lịch với học phần đã đăng ký"},
	{service.ErrPrerequisiteNotMet, 409, "PREREQUISITE_NOT_MET", "Chưa đạt học phần tiên quyết"},
	{service.ErrCreditLimitExceeded, 409, "CREDIT_LIMIT_EXCEEDED", "Vượt quá số tín chỉ tối đa của học kỳ"},
	{service.ErrInvalidReference, 400, "VALIDATION_ERROR", "Dữ liệu tham chiếu không tồn tại"},
	{service.ErrInvalidSchedule, 400, "VALIDATION_ERROR", "Tiết kết thúc phải lớn hơn hoặc bằng tiết bắt đầu"},
}

func success(c *gin.Context, status int, data any) {
	c.JSON(status, successResponse{Status: "success", Data: data})
}

func fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, failResponse{Status: "fail", Data: failData{Code: code, Message: message}})
}

// classify maps a service error to its HTTP status, code and message.
// Unknown errors are logged and reported as INTERNAL_ERROR.
func classify(err error) (int, string, string) {
	for _, f := range failures {
		if errors.Is(err, f.err) {
			return f.status, f.code, f.message
		}
	}
	log.Printf("internal error: %v", err)
	return 500, "INTERNAL_ERROR", "Lỗi hệ thống"
}

func failWithError(c *gin.Context, err error) {
	status, code, message := classify(err)
	var cooldown *service.LoginCooldownError
	if errors.As(err, &cooldown) {
		c.Header("Retry-After", strconv.Itoa(cooldown.RetryAfter))
		c.AbortWithStatusJSON(status, loginCooldownResponse{Status: "fail", Data: loginCooldownData{
			Code: code, Message: message, RetryAfter: cooldown.RetryAfter, LoginAllowedAt: cooldown.LoginAllowedAt,
		}})
		return
	}
	fail(c, status, code, message)
}
