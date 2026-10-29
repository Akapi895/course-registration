package controller

import (
	"context"
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

func newRegistrationHarness(t *testing.T) (*authHarness, string) {
	t.Helper()
	h := newAuthHarness(t)
	_, err := h.db.Exec(context.Background(), `
		INSERT INTO semesters (name, registration_opens_at, registration_closes_at, max_credits)
		VALUES ('Test semester', now() - interval '1 day', now() + interval '1 day', 12);
		INSERT INTO courses (code, name, credits, faculty) VALUES ('TEST101', 'Test course', 3, 'Test faculty');
		INSERT INTO course_classes (course_id, semester_id, class_code, lecturer_name, max_capacity)
		VALUES (1, 1, 'TEST101-01', 'Test lecturer', 5);
		INSERT INTO class_schedules (class_id, day_of_week, start_period, end_period, room)
		VALUES (1, 2, 1, 3, 'Test room');`)
	if err != nil {
		t.Fatal(err)
	}
	rec, reply := h.login(t, "student")
	if rec.Code != http.StatusOK {
		t.Fatalf("login: %d %s", rec.Code, rec.Body)
	}
	return h, reply.Data.AccessToken
}

func registerTestClass(t *testing.T, h *authHarness, token string) int64 {
	t.Helper()
	rec, _ := h.request(t, http.MethodPost, "/api/registrations", token, map[string]any{"class_ids": []int{1}})
	var reply struct {
		Data struct {
			Results []struct {
				ID     int64  `json:"id"`
				Status string `json:"status"`
			} `json:"results"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &reply); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK || len(reply.Data.Results) != 1 || reply.Data.Results[0].Status != "registered" || reply.Data.Results[0].ID <= 0 {
		t.Fatalf("register: %d %s", rec.Code, rec.Body)
	}
	return reply.Data.Results[0].ID
}

func TestRegistrationCancellationDeletesRecord(t *testing.T) {
	h, token := newRegistrationHarness(t)
	id := registerTestClass(t, h, token)
	list, _ := h.request(t, http.MethodGet, "/api/registrations", token, nil)
	var registrations struct {
		Data struct {
			Registrations []map[string]json.RawMessage `json:"registrations"`
		} `json:"data"`
	}
	if err := json.Unmarshal(list.Body.Bytes(), &registrations); err != nil {
		t.Fatal(err)
	}
	if list.Code != http.StatusOK || len(registrations.Data.Registrations) != 1 {
		t.Fatalf("list registrations: %d %s", list.Code, list.Body)
	}
	if _, exists := registrations.Data.Registrations[0]["status"]; exists {
		t.Fatalf("registration still exposes status: %s", list.Body)
	}
	path := "/api/registrations/" + strconv.FormatInt(id, 10)
	rec, _ := h.request(t, http.MethodDelete, path, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel: %d %s", rec.Code, rec.Body)
	}
	rec, reply := h.request(t, http.MethodDelete, path, token, nil)
	if rec.Code != http.StatusNotFound || reply.Data.Code != "NOT_FOUND" {
		t.Fatalf("cancel deleted registration: %d %s", rec.Code, rec.Body)
	}
	for _, check := range []struct{ path, field string }{
		{"/api/registrations", "registrations"}, {"/api/schedules", "schedules"},
	} {
		rec, _ := h.request(t, http.MethodGet, check.path, token, nil)
		var list struct {
			Data map[string][]json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
		if rec.Code != http.StatusOK || list.Data[check.field] == nil || len(list.Data[check.field]) != 0 {
			t.Fatalf("list after cancellation: %d %s", rec.Code, rec.Body)
		}
	}
	rec, _ = h.request(t, http.MethodGet, "/api/classes/1", token, nil)
	var class struct {
		Data struct {
			Enrolled int `json:"enrolled"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &class); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK || class.Data.Enrolled != 0 {
		t.Fatalf("capacity after cancellation: %d %s", rec.Code, rec.Body)
	}
	if nextID := registerTestClass(t, h, token); nextID == id {
		t.Fatalf("re-registration reused deleted id %d", id)
	}
	rec, reply = h.request(t, http.MethodDelete, path, token, nil)
	if rec.Code != http.StatusNotFound || reply.Data.Code != "NOT_FOUND" {
		t.Fatalf("old id after re-registration: %d %s", rec.Code, rec.Body)
	}
}

func TestRegistrationClassCancellationDeletesRegistrations(t *testing.T) {
	h, token := newRegistrationHarness(t)
	id := registerTestClass(t, h, token)
	login, admin := h.login(t, "admin")
	if login.Code != http.StatusOK {
		t.Fatalf("admin login: %d %s", login.Code, login.Body)
	}
	rec, _ := h.request(t, http.MethodDelete, "/api/classes/1", admin.Data.AccessToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("cancel class: %d %s", rec.Code, rec.Body)
	}
	rec, reply := h.request(t, http.MethodDelete, "/api/registrations/"+strconv.FormatInt(id, 10), token, nil)
	if rec.Code != http.StatusNotFound || reply.Data.Code != "NOT_FOUND" {
		t.Fatalf("cancel registration of cancelled class: %d %s", rec.Code, rec.Body)
	}
	rec, _ = h.request(t, http.MethodGet, "/api/registrations", token, nil)
	var registrations struct {
		Data struct {
			Registrations []json.RawMessage `json:"registrations"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &registrations); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK || len(registrations.Data.Registrations) != 0 {
		t.Fatalf("registrations after class cancellation: %d %s", rec.Code, rec.Body)
	}
	rec, _ = h.request(t, http.MethodGet, "/api/classes/1", token, nil)
	var class struct {
		Data struct {
			Status   string `json:"status"`
			Enrolled int    `json:"enrolled"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &class); err != nil {
		t.Fatal(err)
	}
	if rec.Code != http.StatusOK || class.Data.Status != "cancelled" || class.Data.Enrolled != 0 {
		t.Fatalf("class after cancellation: %d %s", rec.Code, rec.Body)
	}
}

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
