package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

var loginFields = map[string]bool{"username": true, "password": true}

type AuthController struct {
	auth *service.AuthService
}

func NewAuthController(auth *service.AuthService) *AuthController {
	return &AuthController{auth: auth}
}

type loginRequest struct {
	Username string `json:"username" binding:"required" example:"student001"`
	Password string `json:"password" binding:"required" example:"DemoUET@123"`
}

type loginData struct {
	AccessToken string `json:"access_token"`
}

type loginSuccessResponse struct {
	Status string    `json:"status" example:"success"`
	Data   loginData `json:"data"`
}

type meData struct {
	ID          int64   `json:"id" example:"7"`
	Username    string  `json:"username" example:"student001"`
	Role        string  `json:"role" example:"student"`
	FullName    string  `json:"full_name" example:"Sinh viên giả lập 001"`
	StudentCode *string `json:"student_code" example:"DEMO00001"`
	Faculty     *string `json:"faculty" example:"Công nghệ thông tin"`
	Major       *string `json:"major" example:"Công nghệ thông tin"`
}

type meSuccessResponse struct {
	Status string `json:"status" example:"success"`
	Data   meData `json:"data"`
}

type emptySuccessResponse struct {
	Status string   `json:"status" example:"success"`
	Data   struct{} `json:"data"`
}

// Login godoc
// @Summary     Đăng nhập
// @Description Chỉ trả access_token và tạo một phiên có expires_at = created_at + JWT_TTL. Mỗi tài khoản chỉ có một phiên hoạt động trên mọi thiết bị/tab. Phiên đang hoạt động trả ALREADY_LOGGED_IN; sau logout hoặc hết hạn phải chờ LOGIN_COOLDOWN từ COALESCE(logged_out_at, expires_at). Kiểm tra mật khẩu trước khi kiểm tra phiên; áp dụng cả sinh viên và quản trị viên.
// @Tags        auth
// @Accept      json
// @Produce     json
// @Param       body body     loginRequest true "Thông tin đăng nhập"
// @Success     200  {object} loginSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "INVALID_CREDENTIALS"
// @Failure     409  {object} failResponse "ALREADY_LOGGED_IN"
// @Failure     429  {object} loginCooldownResponse "LOGIN_COOLDOWN"
// @Header      429  {integer} Retry-After "Số giây còn phải chờ trước lần đăng nhập tiếp theo"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/auth/login [post]
func (h *AuthController) Login(c *gin.Context) {
	var req loginRequest
	if !bindJSON(c, loginFields, &req) {
		return
	}

	token, err := h.auth.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, loginData{AccessToken: token})
}

// Logout godoc
// @Summary     Đăng xuất và kết thúc phiên hiện tại
// @Description Ghi logged_out_at một lần cho sid hiện tại nếu phiên chưa hết hạn; giữ nguyên expires_at. JWT cũ bị từ chối ngay, cooldown bắt đầu từ logged_out_at. Phiên hết hạn tự động không ghi logged_out_at.
// @Tags        auth
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} emptySuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/auth/logout [post]
func (h *AuthController) Logout(c *gin.Context) {
	if err := h.auth.Logout(c.Request.Context(), currentPrincipal(c).SID); err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, struct{}{})
}

// Me godoc
// @Summary     Thông tin người dùng hiện tại
// @Description Kiểm tra JWT HS256 (sub, role, sid, iat, exp), phiên đang hoạt động và vai trò hiện tại trong users. Các trường student_code, faculty, major có thể null.
// @Tags        auth
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} meSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/auth/me [get]
func (h *AuthController) Me(c *gin.Context) {
	user, err := h.auth.Me(c.Request.Context(), currentPrincipal(c).UserID)
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, meData{
		ID:          user.ID,
		Username:    user.Username,
		Role:        user.Role,
		FullName:    user.FullName,
		StudentCode: user.StudentCode,
		Faculty:     user.Faculty,
		Major:       user.Major,
	})
}
