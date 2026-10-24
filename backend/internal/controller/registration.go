package controller

import (
	"time"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

var registerFields = map[string]bool{"class_ids": true}

type RegistrationController struct {
	registrations *service.RegistrationService
}

func NewRegistrationController(registrations *service.RegistrationService) *RegistrationController {
	return &RegistrationController{registrations: registrations}
}

type registerRequest struct {
	ClassIDs []int64 `json:"class_ids" binding:"required,min=1,max=20,dive,gt=0" example:"10,11,12"`
}

// registerResultItem is the outcome for one requested class. A registered
// class carries id and registered_at; a failed class carries code and message.
type registerResultItem struct {
	ClassID      int64      `json:"class_id" example:"10"`
	Status       string     `json:"status" enums:"registered,failed" example:"registered"`
	ID           *int64     `json:"id,omitempty" example:"301"`
	RegisteredAt *time.Time `json:"registered_at,omitempty" example:"2026-10-21T09:00:00+07:00"`
	Code         string     `json:"code,omitempty" example:"CLASS_FULL"`
	Message      string     `json:"message,omitempty" example:"Lớp học phần đã đủ sĩ số"`
}

type registerData struct {
	RegisteredCount int                  `json:"registered_count" example:"3"`
	FailedCount     int                  `json:"failed_count" example:"2"`
	Results         []registerResultItem `json:"results"`
}

type registerSuccessResponse struct {
	Status string       `json:"status" example:"success"`
	Data   registerData `json:"data"`
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
// @Summary     Đăng ký một hoặc nhiều lớp học phần
// @Description Chỉ sinh viên được đăng ký. Gửi tối đa 20 lớp trong `class_ids`, không trùng nhau. Các lớp được xử lý lần lượt theo thứ tự gửi, mỗi lớp trong một transaction riêng: lớp đáp ứng điều kiện được ghi nhận, lớp bị từ chối được trả lại kèm `code` (NOT_FOUND, CLASS_CANCELLED, CLASS_FULL, REGISTRATION_CLOSED, ALREADY_REGISTERED, SCHEDULE_CONFLICT, PREREQUISITE_NOT_MET, CREDIT_LIMIT_EXCEEDED hoặc INTERNAL_ERROR) và `message`, không ảnh hưởng các lớp khác. Quy tắc trùng lịch và giới hạn tín chỉ tính cả các lớp vừa được ghi nhận trong cùng yêu cầu. Yêu cầu hợp lệ luôn trả 200, kể cả khi mọi lớp đều bị từ chối; xem `registered_count`, `failed_count` và `results`.
// @Tags        registrations
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body     registerRequest true "Danh sách lớp cần đăng ký"
// @Success     200  {object} registerSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/registrations [post]
func (h *RegistrationController) Register(c *gin.Context) {
	var req registerRequest
	if !bindJSON(c, registerFields, &req) {
		return
	}
	seen := make(map[int64]bool, len(req.ClassIDs))
	for _, id := range req.ClassIDs {
		if seen[id] {
			fail(c, 400, "VALIDATION_ERROR", "Danh sách lớp bị trùng")
			return
		}
		seen[id] = true
	}

	results, err := h.registrations.RegisterBatch(c.Request.Context(), currentPrincipal(c), req.ClassIDs)
	if err != nil {
		failWithError(c, err)
		return
	}

	data := registerData{Results: make([]registerResultItem, 0, len(results))}
	for _, r := range results {
		item := registerResultItem{ClassID: r.ClassID}
		if r.Err != nil {
			_, item.Code, item.Message = classify(r.Err)
			item.Status = "failed"
			data.FailedCount++
		} else {
			item.Status = r.Registration.Status
			item.ID = &r.Registration.ID
			item.RegisteredAt = &r.Registration.RegisteredAt
			data.RegisteredCount++
		}
		data.Results = append(data.Results, item)
	}
	success(c, 200, data)
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
