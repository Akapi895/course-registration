package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

type ClassController struct {
	classes *service.ClassService
}

func NewClassController(classes *service.ClassService) *ClassController {
	return &ClassController{classes: classes}
}

type classItem struct {
	ID               int64  `json:"id" example:"10"`
	ClassCode        string `json:"class_code" example:"INT3401-01"`
	CourseCode       string `json:"course_code" example:"INT3401"`
	CourseName       string `json:"course_name" example:"Hệ điều hành"`
	Credits          int    `json:"credits" example:"3"`
	Enrolled         int    `json:"enrolled" example:"42"`
	MaxCapacity      int    `json:"max_capacity" example:"50"`
	RegistrationOpen bool   `json:"registration_open" example:"true"`
}

type classListData struct {
	Classes []classItem `json:"classes"`
}

type classListSuccessResponse struct {
	Status string        `json:"status" example:"success"`
	Data   classListData `json:"data"`
}

type scheduleItem struct {
	DayOfWeek   int    `json:"day_of_week" example:"2"`
	StartPeriod int    `json:"start_period" example:"1"`
	EndPeriod   int    `json:"end_period" example:"3"`
	Room        string `json:"room" example:"A2-301"`
}

type classDetailData struct {
	ID               int64          `json:"id" example:"10"`
	CourseID         int64          `json:"course_id" example:"5"`
	CourseCode       string         `json:"course_code" example:"INT3401"`
	CourseName       string         `json:"course_name" example:"Hệ điều hành"`
	Credits          int            `json:"credits" example:"3"`
	SemesterID       int64          `json:"semester_id" example:"2"`
	ClassCode        string         `json:"class_code" example:"INT3401-01"`
	LecturerName     string         `json:"lecturer_name" example:"Giảng viên A"`
	MaxCapacity      int            `json:"max_capacity" example:"50"`
	Enrolled         int            `json:"enrolled" example:"42"`
	Status           string         `json:"status" example:"active"`
	RegistrationOpen bool           `json:"registration_open" example:"true"`
	Schedules        []scheduleItem `json:"schedules"`
}

type classDetailSuccessResponse struct {
	Status string          `json:"status" example:"success"`
	Data   classDetailData `json:"data"`
}

// List godoc
// @Summary     Danh sách lớp học phần đang mở
// @Description Trả về các lớp active của học kỳ hiện tại, tức học kỳ mới nhất đã mở đăng ký. Trả về danh sách rỗng khi chưa có học kỳ nào mở đăng ký.
// @Tags        classes
// @Produce     json
// @Security    BearerAuth
// @Param       faculty query string false "Lọc theo khoa"
// @Param       major   query string false "Lọc theo ngành"
// @Success     200 {object} classListSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/classes [get]
func (h *ClassController) List(c *gin.Context) {
	views, err := h.classes.ListCurrent(c.Request.Context(), service.ClassFilter{
		Faculty: optionalQuery(c, "faculty"),
		Major:   optionalQuery(c, "major"),
	})
	if err != nil {
		failWithError(c, err)
		return
	}

	items := make([]classItem, 0, len(views))
	for _, v := range views {
		items = append(items, classItem{
			ID:               v.ID,
			ClassCode:        v.ClassCode,
			CourseCode:       v.CourseCode,
			CourseName:       v.CourseName,
			Credits:          v.Credits,
			Enrolled:         v.Enrolled,
			MaxCapacity:      v.MaxCapacity,
			RegistrationOpen: v.RegistrationOpen,
		})
	}
	success(c, 200, classListData{Classes: items})
}

// Get godoc
// @Summary     Chi tiết lớp học phần
// @Description Trả về cả lớp đã hủy, với trạng thái status = cancelled.
// @Tags        classes
// @Produce     json
// @Security    BearerAuth
// @Param       id path int true "ID lớp học phần"
// @Success     200 {object} classDetailSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     404 {object} failResponse "NOT_FOUND"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/classes/{id} [get]
func (h *ClassController) Get(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	view, err := h.classes.Get(c.Request.Context(), id)
	if err != nil {
		failWithError(c, err)
		return
	}

	schedules := make([]scheduleItem, 0, len(view.Schedules))
	for _, s := range view.Schedules {
		schedules = append(schedules, scheduleItem{
			DayOfWeek:   s.DayOfWeek,
			StartPeriod: s.StartPeriod,
			EndPeriod:   s.EndPeriod,
			Room:        s.Room,
		})
	}
	success(c, 200, classDetailData{
		ID:               view.ID,
		CourseID:         view.CourseID,
		CourseCode:       view.CourseCode,
		CourseName:       view.CourseName,
		Credits:          view.Credits,
		SemesterID:       view.SemesterID,
		ClassCode:        view.ClassCode,
		LecturerName:     view.LecturerName,
		MaxCapacity:      view.MaxCapacity,
		Enrolled:         view.Enrolled,
		Status:           view.Status,
		RegistrationOpen: view.RegistrationOpen,
		Schedules:        schedules,
	})
}

func optionalQuery(c *gin.Context, key string) *string {
	v := c.Query(key)
	if v == "" {
		return nil
	}
	return &v
}
