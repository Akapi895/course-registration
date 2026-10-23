package controller

import (
	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

var updatableClassFields = map[string]bool{
	"class_code": true, "lecturer_name": true, "max_capacity": true, "schedules": true,
}

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

type scheduleRequest struct {
	DayOfWeek   int    `json:"day_of_week" binding:"required,min=2,max=7" example:"2"`
	StartPeriod int    `json:"start_period" binding:"required,gt=0" example:"1"`
	EndPeriod   int    `json:"end_period" binding:"required,gt=0" example:"3"`
	Room        string `json:"room" binding:"required" example:"A2-301"`
}

type createClassRequest struct {
	CourseID     int64             `json:"course_id" binding:"required,gt=0" example:"5"`
	SemesterID   int64             `json:"semester_id" binding:"required,gt=0" example:"2"`
	ClassCode    string            `json:"class_code" binding:"required" example:"INT3401-01"`
	LecturerName string            `json:"lecturer_name" binding:"required" example:"Giảng viên A"`
	MaxCapacity  int               `json:"max_capacity" binding:"required,gt=0" example:"50"`
	Schedules    []scheduleRequest `json:"schedules" binding:"required,min=1,dive"`
}

type updateClassRequest struct {
	ClassCode    string            `json:"class_code" binding:"required" example:"INT3401-01"`
	LecturerName string            `json:"lecturer_name" binding:"required" example:"Giảng viên B"`
	MaxCapacity  int               `json:"max_capacity" binding:"required,gt=0" example:"60"`
	Schedules    []scheduleRequest `json:"schedules" binding:"required,min=1,dive"`
}

type classCreatedData struct {
	ID        int64  `json:"id" example:"10"`
	ClassCode string `json:"class_code" example:"INT3401-01"`
	Status    string `json:"status" example:"active"`
	Enrolled  int    `json:"enrolled" example:"0"`
}

type classCreatedSuccessResponse struct {
	Status string           `json:"status" example:"success"`
	Data   classCreatedData `json:"data"`
}

type classUpdatedData struct {
	ID           int64  `json:"id" example:"10"`
	ClassCode    string `json:"class_code" example:"INT3401-01"`
	LecturerName string `json:"lecturer_name" example:"Giảng viên B"`
	MaxCapacity  int    `json:"max_capacity" example:"60"`
}

type classUpdatedSuccessResponse struct {
	Status string           `json:"status" example:"success"`
	Data   classUpdatedData `json:"data"`
}

type classCancelData struct {
	ID     int64  `json:"id" example:"10"`
	Status string `json:"status" example:"cancelled"`
}

type classCancelSuccessResponse struct {
	Status string          `json:"status" example:"success"`
	Data   classCancelData `json:"data"`
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

// Create godoc
// @Summary     Tạo lớp học phần (admin)
// @Description Tạo lớp active kèm lịch học. class_code phải duy nhất trong học kỳ.
// @Tags        classes
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body body     createClassRequest true "Thông tin lớp và lịch học"
// @Success     201  {object} classCreatedSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     409  {object} failResponse "CONFLICT"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/classes [post]
func (h *ClassController) Create(c *gin.Context) {
	var req createClassRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, 400, "VALIDATION_ERROR", "Dữ liệu không hợp lệ")
		return
	}

	id, err := h.classes.Create(c.Request.Context(), currentPrincipal(c), req.CourseID, req.SemesterID,
		toClassInput(req.ClassCode, req.LecturerName, req.MaxCapacity, req.Schedules))
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 201, classCreatedData{ID: id, ClassCode: req.ClassCode, Status: "active", Enrolled: 0})
}

// Update godoc
// @Summary     Cập nhật lớp học phần (admin)
// @Description Thay thế mã lớp, giảng viên, sĩ số và lịch học. Không đổi được course_id và semester_id. Sau khi có sinh viên đăng ký, không đổi được lịch học.
// @Tags        classes
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       id   path int                true "ID lớp học phần"
// @Param       body body updateClassRequest true "Thông tin cần cập nhật"
// @Success     200  {object} classUpdatedSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     404  {object} failResponse "NOT_FOUND"
// @Failure     409  {object} failResponse "CONFLICT, CLASS_CANCELLED, CAPACITY_BELOW_ENROLLED hoặc SCHEDULE_LOCKED"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/classes/{id} [put]
func (h *ClassController) Update(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	var req updateClassRequest
	if !bindJSON(c, updatableClassFields, &req) {
		return
	}

	err := h.classes.Update(c.Request.Context(), currentPrincipal(c), id,
		toClassInput(req.ClassCode, req.LecturerName, req.MaxCapacity, req.Schedules))
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, classUpdatedData{
		ID:           id,
		ClassCode:    req.ClassCode,
		LecturerName: req.LecturerName,
		MaxCapacity:  req.MaxCapacity,
	})
}

// Cancel godoc
// @Summary     Hủy lớp học phần (admin)
// @Description Chuyển lớp sang trạng thái cancelled. Các đăng ký còn hiệu lực của lớp cũng được hủy. Không xóa vật lý.
// @Tags        classes
// @Produce     json
// @Security    BearerAuth
// @Param       id path int true "ID lớp học phần"
// @Success     200 {object} classCancelSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403 {object} failResponse "FORBIDDEN"
// @Failure     404 {object} failResponse "NOT_FOUND"
// @Failure     409 {object} failResponse "CLASS_CANCELLED"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/classes/{id} [delete]
func (h *ClassController) Cancel(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	if err := h.classes.Cancel(c.Request.Context(), currentPrincipal(c), id); err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, classCancelData{ID: id, Status: "cancelled"})
}

func optionalQuery(c *gin.Context, key string) *string {
	v := c.Query(key)
	if v == "" {
		return nil
	}
	return &v
}

func toClassInput(classCode, lecturerName string, maxCapacity int, schedules []scheduleRequest) service.ClassInput {
	inputs := make([]service.ScheduleInput, 0, len(schedules))
	for _, s := range schedules {
		inputs = append(inputs, service.ScheduleInput{
			DayOfWeek:   s.DayOfWeek,
			StartPeriod: s.StartPeriod,
			EndPeriod:   s.EndPeriod,
			Room:        s.Room,
		})
	}
	return service.ClassInput{
		ClassCode:    classCode,
		LecturerName: lecturerName,
		MaxCapacity:  maxCapacity,
		Schedules:    inputs,
	}
}
