package controller

import (
	"strconv"
	"strings"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

var updatableStudentFields = map[string]bool{"full_name": true, "faculty": true, "major": true}

type StudentController struct {
	students *service.StudentService
}

func NewStudentController(students *service.StudentService) *StudentController {
	return &StudentController{students: students}
}

type studentData struct {
	ID          int64   `json:"id" example:"7"`
	Username    string  `json:"username" example:"student001"`
	FullName    string  `json:"full_name" example:"Sinh viên giả lập 001"`
	StudentCode *string `json:"student_code" example:"DEMO00001"`
	Faculty     *string `json:"faculty" example:"CNTT"`
	Major       *string `json:"major" example:"Khoa học máy tính"`
}

type studentSuccessResponse struct {
	Status string      `json:"status" example:"success"`
	Data   studentData `json:"data"`
}

type studentProfileData struct {
	ID          int64   `json:"id" example:"7"`
	FullName    string  `json:"full_name" example:"Nguyễn Văn A"`
	StudentCode *string `json:"student_code" example:"DEMO00001"`
	Faculty     *string `json:"faculty" example:"CNTT"`
	Major       *string `json:"major" example:"Khoa học máy tính"`
}

type studentProfileSuccessResponse struct {
	Status string             `json:"status" example:"success"`
	Data   studentProfileData `json:"data"`
}

type updateStudentRequest struct {
	FullName string  `json:"full_name" example:"Nguyễn Văn A"`
	Faculty  *string `json:"faculty" example:"CNTT"`
	Major    *string `json:"major" example:"Khoa học máy tính"`
}

// Get godoc
// @Summary     Xem thông tin sinh viên
// @Description Sinh viên chỉ xem được tài khoản của chính mình. Admin xem được mọi sinh viên.
// @Tags        students
// @Produce     json
// @Security    BearerAuth
// @Param       id path int true "ID tài khoản sinh viên"
// @Success     200 {object} studentSuccessResponse
// @Failure     401 {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403 {object} failResponse "FORBIDDEN"
// @Failure     404 {object} failResponse "NOT_FOUND"
// @Failure     500 {object} failResponse "INTERNAL_ERROR"
// @Router      /api/students/{id} [get]
func (h *StudentController) Get(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	user, err := h.students.Get(c.Request.Context(), currentPrincipal(c), id)
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, studentData{
		ID:          user.ID,
		Username:    user.Username,
		FullName:    user.FullName,
		StudentCode: user.StudentCode,
		Faculty:     user.Faculty,
		Major:       user.Major,
	})
}

// Update godoc
// @Summary     Cập nhật thông tin sinh viên
// @Description Thay thế họ tên, khoa và ngành. Sinh viên chỉ sửa được tài khoản của chính mình. Admin sửa được mọi sinh viên.
// @Tags        students
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       id   path int                 true "ID tài khoản sinh viên"
// @Param       body body updateStudentRequest true "Thông tin cần cập nhật"
// @Success     200  {object} studentProfileSuccessResponse
// @Failure     400  {object} failResponse "VALIDATION_ERROR"
// @Failure     401  {object} failResponse "UNAUTHORIZED hoặc SESSION_REVOKED"
// @Failure     403  {object} failResponse "FORBIDDEN"
// @Failure     404  {object} failResponse "NOT_FOUND"
// @Failure     500  {object} failResponse "INTERNAL_ERROR"
// @Router      /api/students/{id} [put]
func (h *StudentController) Update(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}
	req, ok := bindUpdateStudent(c)
	if !ok {
		return
	}

	user, err := h.students.Update(c.Request.Context(), currentPrincipal(c), id, service.StudentProfile{
		FullName: req.FullName,
		Faculty:  req.Faculty,
		Major:    req.Major,
	})
	if err != nil {
		failWithError(c, err)
		return
	}
	success(c, 200, studentProfileData{
		ID:          user.ID,
		FullName:    user.FullName,
		StudentCode: user.StudentCode,
		Faculty:     user.Faculty,
		Major:       user.Major,
	})
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		fail(c, 404, "NOT_FOUND", "Không tìm thấy dữ liệu")
		return 0, false
	}
	return id, true
}

// bindUpdateStudent accepts only the updatable profile fields, so that
// client-owned fields such as username or role cannot be changed.
func bindUpdateStudent(c *gin.Context) (updateStudentRequest, bool) {
	var req updateStudentRequest
	if !bindJSON(c, updatableStudentFields, &req) {
		return req, false
	}
	if strings.TrimSpace(req.FullName) == "" {
		fail(c, 400, "VALIDATION_ERROR", "full_name là bắt buộc")
		return req, false
	}
	return req, true
}
