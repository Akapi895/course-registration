package controller

import (
	"time"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

var updatableRegistrationPeriodFields = map[string]bool{
	"semester_id": true, "registration_opens_at": true, "registration_closes_at": true,
}

type RegistrationPeriodController struct {
	periods *service.RegistrationPeriodService
}

func NewRegistrationPeriodController(periods *service.RegistrationPeriodService) *RegistrationPeriodController {
	return &RegistrationPeriodController{periods: periods}
}

type updateRegistrationPeriodRequest struct {
	SemesterID           int64     `json:"semester_id" binding:"required,gt=0" example:"2"`
	RegistrationOpensAt  time.Time `json:"registration_opens_at" binding:"required" example:"2026-11-01T00:00:00+07:00"`
	RegistrationClosesAt time.Time `json:"registration_closes_at" binding:"required" example:"2026-11-14T23:59:59+07:00"`
}

type registrationPeriodData struct {
	SemesterID           int64     `json:"semester_id" example:"2"`
	RegistrationOpensAt  time.Time `json:"registration_opens_at" example:"2026-11-01T00:00:00+07:00"`
	RegistrationClosesAt time.Time `json:"registration_closes_at" example:"2026-11-14T23:59:59+07:00"`
}

type registrationPeriodSuccessResponse struct {
	Status string                 `json:"status" example:"success"`
	Data   registrationPeriodData `json:"data"`
}

// Update godoc
// @Summary     Cấu hình thời gian đăng ký của học kỳ (admin)
// @Description Đặt thời điểm mở và đóng đăng ký. Thời điểm đóng phải sau thời điểm mở.
// @Tags        registration-period
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body     updateRegistrationPeriodRequest true "Học kỳ và khung thời gian đăng ký"
// @Success     200  {object} registrationPeriodSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/registration-period [put]
func (h *RegistrationPeriodController) Update(c *gin.Context) {
	var req updateRegistrationPeriodRequest
	if !bindJSON(c, updatableRegistrationPeriodFields, &req) {
		return
	}

	err := h.periods.Update(c.Request.Context(), currentPrincipal(c), req.SemesterID,
		req.RegistrationOpensAt, req.RegistrationClosesAt)
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, registrationPeriodData{
		SemesterID:           req.SemesterID,
		RegistrationOpensAt:  req.RegistrationOpensAt,
		RegistrationClosesAt: req.RegistrationClosesAt,
	})
}
