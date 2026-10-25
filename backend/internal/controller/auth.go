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
// @Description Trả về access JWT và tạo một phiên trong auth_sessions.
// @Tags        auth
// @Accept      json
// @Produce     json
// @Param       body body     loginRequest true "Thông tin đăng nhập"
// @Success     200  {object} loginSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "INVALID_CREDENTIALS"
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
// @Summary     Đăng xuất và thu hồi phiên
// @Description Thu hồi phiên của JWT hiện tại. Sau đó JWT này bị từ chối.
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
