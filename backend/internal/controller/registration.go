package controller

import (
	"time"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type RegistrationController struct {
	registrations *service.RegistrationService
}

func NewRegistrationController(registrations *service.RegistrationService) *RegistrationController {
	return &RegistrationController{registrations: registrations}
}

type registerRequest struct {
	ClassID int64 `json:"class_id" binding:"required,gt=0" example:"10"`
}

type registrationData struct {
	ID           int64     `json:"id" example:"301"`
	ClassID      int64     `json:"class_id" example:"10"`
	Status       string    `json:"status" example:"registered"`
	RegisteredAt time.Time `json:"registered_at" example:"2026-10-21T09:00:00+07:00"`
}

type registrationSuccessResponse struct {
	Status string           `json:"status" example:"success"`
	Data   registrationData `json:"data"`
}

type registeredClassItem struct {
	ID           int64     `json:"id" example:"301"`
	ClassID      int64     `json:"class_id" example:"10"`
	ClassCode    string    `json:"class_code" example:"INT3401-01"`
	CourseCode   string    `json:"course_code" example:"INT3401"`
	CourseName   string    `json:"course_name" example:"Hệ điều hành"`
	Credits      int       `json:"credits" example:"3"`
	Status       string    `json:"status" example:"registered"`
	RegisteredAt time.Time `json:"registered_at" example:"2026-10-21T09:00:00+07:00"`
}

type registrationListData struct {
	Registrations []registeredClassItem `json:"registrations"`
}

type registrationListSuccessResponse struct {
	Status string               `json:"status" example:"success"`
	Data   registrationListData `json:"data"`
}

type cancelData struct {
	ID     int64  `json:"id" example:"301"`
	Status string `json:"status" example:"cancelled"`
}

type cancelSuccessResponse struct {
	Status string     `json:"status" example:"success"`
	Data   cancelData `json:"data"`
}

// Register godoc
// @Summary     Đăng ký lớp học phần
// @Description Chỉ sinh viên được đăng ký. Kiểm tra lớp, thời gian, đăng ký trùng, trùng lịch, tiên quyết, tín chỉ và sĩ số trong một transaction.
// @Tags        registrations
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body     registerRequest true "Lớp cần đăng ký"
// @Success     201  {object} registrationSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     404  {object} failResponse "NOT_FOUND"
// @Failure     409  {object} failResponse "CLASS_CANCELLED, CLASS_FULL, REGISTRATION_CLOSED, ALREADY_REGISTERED, SCHEDULE_CONFLICT, PREREQUISITE_NOT_MET hoặc CREDIT_LIMIT_EXCEEDED"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/registrations [post]
func (h *RegistrationController) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "VALIDATION_ERROR", "class_id không hợp lệ")
		return
	}

	reg, err := h.registrations.Register(c.Request.Context(), currentPrincipal(c), req.ClassID)
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 201, registrationData{
		ID:           reg.ID,
		ClassID:      reg.ClassID,
		Status:       reg.Status,
		RegisteredAt: reg.RegisteredAt,
	})
}

// List godoc
// @Summary     Các học phần đã đăng ký của tôi
// @Description Trả về toàn bộ đăng ký đang hiệu lực (status = registered) của sinh viên hiện tại.
// @Tags        registrations
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} registrationListSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403 {object} failResponse "FORBIDDEN"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/registrations [get]
func (h *RegistrationController) List(c *gin.Context) {
	regs, err := h.registrations.ListRegistered(c.Request.Context(), currentPrincipal(c))
	if err != nil {
		failWithError(c, err)
		return
	}

	items := make([]registeredClassItem, 0, len(regs))
	for _, r := range regs {
		items = append(items, registeredClassItem{
			ID:           r.ID,
			ClassID:      r.ClassID,
			ClassCode:    r.ClassCode,
			CourseCode:   r.CourseCode,
			CourseName:   r.CourseName,
			Credits:      r.Credits,
			Status:       r.Status,
			RegisteredAt: r.RegisteredAt,
		})
	}
	success(c, 200, registrationListData{Registrations: items})
}

// Cancel godoc
// @Summary     Hủy đăng ký học phần
// @Description Chỉ hủy được đăng ký của chính mình, trong thời gian đăng ký của học kỳ.
// @Tags        registrations
// @Produce     json
// @Security    BearerAuth
// @Param       id path int true "ID đăng ký"
// @Success     200 {object} cancelSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403 {object} failResponse "FORBIDDEN"
// @Failure     404 {object} failResponse "NOT_FOUND"
// @Failure     409 {object} failResponse "REGISTRATION_NOT_ACTIVE hoặc REGISTRATION_CLOSED"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/registrations/{id} [delete]
func (h *RegistrationController) Cancel(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	if err := h.registrations.Cancel(c.Request.Context(), currentPrincipal(c), id); err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, cancelData{ID: id, Status: "cancelled"})
}
