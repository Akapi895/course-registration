package controller

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/Akapi895/course-registration/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// These requests are rejected before the service is called, so a nil service is safe.
func TestRegisterRejectsInvalidBodies(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/registrations", NewRegistrationController(nil).Register)

	tooMany := make([]string, 21)
	for i := range tooMany {
		tooMany[i] = strconv.Itoa(i + 1)
	}

	tests := []struct {
		name    string
		body    string
		message string
	}{
		{"missing class_ids", `{}`, "Dữ liệu không hợp lệ"},
		{"empty class_ids", `{"class_ids":[]}`, "Dữ liệu không hợp lệ"},
		{"null class_ids", `{"class_ids":null}`, "Dữ liệu không hợp lệ"},
		{"non-positive id", `{"class_ids":[1,0]}`, "Dữ liệu không hợp lệ"},
		{"more than 20 ids", `{"class_ids":[` + strings.Join(tooMany, ",") + `]}`, "Dữ liệu không hợp lệ"},
		{"duplicate ids", `{"class_ids":[3,4,3]}`, "Danh sách lớp bị trùng"},
		{"old single-class field", `{"class_id":5}`, "Trường không được phép cập nhật: class_id"},
		{"unknown field", `{"class_ids":[1],"extra":true}`, "Trường không được phép cập nhật: extra"},
		{"not json", `class_ids`, "Dữ liệu không hợp lệ"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/registrations", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body %s", rec.Code, rec.Body)
			}
			var got failResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Status != "fail" || got.Data.Code != "VALIDATION_ERROR" || got.Data.Message != tt.message {
				t.Fatalf("got %+v, want VALIDATION_ERROR %q", got, tt.message)
			}
		})
	}
}

func TestClassifyMapsPerClassErrors(t *testing.T) {
	tests := []struct {
		err  error
		code string
	}{
		{service.ErrClassFull, "CLASS_FULL"},
		{service.ErrClassCancelled, "CLASS_CANCELLED"},
		{service.ErrRegistrationClosed, "REGISTRATION_CLOSED"},
		{service.ErrAlreadyRegistered, "ALREADY_REGISTERED"},
		{service.ErrScheduleConflict, "SCHEDULE_CONFLICT"},
		{service.ErrPrerequisiteNotMet, "PREREQUISITE_NOT_MET"},
		{service.ErrCreditLimitExceeded, "CREDIT_LIMIT_EXCEEDED"},
		{service.ErrNotFound, "NOT_FOUND"},
	}
	for _, tt := range tests {
		if _, code, message := classify(tt.err); code != tt.code || message == "" {
			t.Errorf("classify(%v) = %q, %q; want code %q with a message", tt.err, code, message, tt.code)
		}
	}

	status, code, message := classify(errors.New("connection refused"))
	if status != http.StatusInternalServerError || code != "INTERNAL_ERROR" || strings.Contains(message, "refused") {
		t.Errorf("unknown error leaked or misclassified: %d %q %q", status, code, message)
	}
}
