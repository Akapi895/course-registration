package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ScheduleController struct {
	registrations *service.RegistrationService
}

func NewScheduleController(registrations *service.RegistrationService) *ScheduleController {
	return &ScheduleController{registrations: registrations}
}

type timetableItem struct {
	ClassID     int64  `json:"class_id" example:"10"`
	ClassCode   string `json:"class_code" example:"INT3401-01"`
	CourseCode  string `json:"course_code" example:"INT3401"`
	CourseName  string `json:"course_name" example:"Hệ điều hành"`
	DayOfWeek   int    `json:"day_of_week" example:"2"`
	StartPeriod int    `json:"start_period" example:"1"`
	EndPeriod   int    `json:"end_period" example:"3"`
	Room        string `json:"room" example:"A2-301"`
}

type scheduleListData struct {
	Schedules []timetableItem `json:"schedules"`
}

type scheduleListSuccessResponse struct {
	Status string           `json:"status" example:"success"`
	Data   scheduleListData `json:"data"`
}

// List godoc
// @Summary     Thời khóa biểu của tôi
// @Description Trả về lịch học của các đăng ký đang hiệu lực, tất cả học kỳ. Client tự lọc theo học kỳ nếu cần.
// @Tags        schedules
// @Produce     json
// @Security    BearerAuth
// @Success     200 {object} scheduleListSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403 {object} failResponse "FORBIDDEN"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/schedules [get]
func (h *ScheduleController) List(c *gin.Context) {
	entries, err := h.registrations.ListSchedules(c.Request.Context(), currentPrincipal(c))
	if err != nil {
		failWithError(c, err)
		return
	}

	items := make([]timetableItem, 0, len(entries))
	for _, e := range entries {
		items = append(items, timetableItem{
			ClassID:     e.ClassID,
			ClassCode:   e.ClassCode,
			CourseCode:  e.CourseCode,
			CourseName:  e.CourseName,
			DayOfWeek:   e.DayOfWeek,
			StartPeriod: e.StartPeriod,
			EndPeriod:   e.EndPeriod,
			Room:        e.Room,
		})
	}
	success(c, 200, scheduleListData{Schedules: items})
}
