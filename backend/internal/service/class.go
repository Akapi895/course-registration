package service

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/repository"
)

type ClassService struct {
	classes   *repository.ClassRepository
	semesters *repository.SemesterRepository
}

func NewClassService(classes *repository.ClassRepository, semesters *repository.SemesterRepository) *ClassService {
	return &ClassService{classes: classes, semesters: semesters}
}

type ClassFilter struct {
	Faculty *string
	Major   *string
}

// ClassInput is the editable part of a class, shared by create and update.
type ClassInput struct {
	ClassCode    string
	LecturerName string
	MaxCapacity  int
	Schedules    []ScheduleInput
}

type ScheduleInput struct {
	DayOfWeek   int
	StartPeriod int
	EndPeriod   int
	Room        string
}

// SemesterView is a semester with its registration state at the time of the request.
type SemesterView struct {
	repository.Semester
	RegistrationOpen bool
}

// CurrentClasses is the current semester together with its active classes.
type CurrentClasses struct {
	// Semester is nil when no semester has opened for registration yet.
	Semester *SemesterView
	Classes  []repository.Class
}

// ListCurrent returns the active classes of the current semester and the
// semester itself. Classes is empty and Semester is nil when no semester has
// opened for registration yet.
func (s *ClassService) ListCurrent(ctx context.Context, filter ClassFilter) (*CurrentClasses, error) {
	now := time.Now()
	semester, err := s.semesters.FindCurrent(ctx, now)
	if err != nil {
		return nil, err
	}
	if semester == nil {
		return &CurrentClasses{Classes: []repository.Class{}}, nil
	}

	classes, err := s.classes.ListActiveBySemester(ctx, semester.ID, filter.Faculty, filter.Major)
	if err != nil {
		return nil, err
	}

	open := isRegistrationOpen(*semester, now)
	return &CurrentClasses{Semester: &SemesterView{Semester: *semester, RegistrationOpen: open}, Classes: classes}, nil
}

// PrerequisiteView is a prerequisite course. Passed is set only when the caller
// is a student, and tells whether that student passed the course.
type PrerequisiteView struct {
	repository.Prerequisite
	Passed *bool
}

// ClassDetail is a class with the prerequisites of its course.
type ClassDetail struct {
	repository.Class
	Prerequisites []PrerequisiteView
}

func (s *ClassService) Get(ctx context.Context, p *Principal, classID int64) (*ClassDetail, error) {
	class, err := s.classes.FindByID(ctx, classID)
	if err != nil {
		return nil, err
	}
	if class == nil {
		return nil, ErrNotFound
	}

	var studentID *int64
	if p.Role == repository.RoleStudent {
		studentID = &p.UserID
	}
	required, err := s.classes.Prerequisites(ctx, class.CourseID, studentID)
	if err != nil {
		return nil, err
	}
	prerequisites := make([]PrerequisiteView, 0, len(required))
	for _, r := range required {
		view := PrerequisiteView{Prerequisite: r}
		if studentID != nil {
			passed := r.Passed
			view.Passed = &passed
		}
		prerequisites = append(prerequisites, view)
	}

	return &ClassDetail{
		Class:         *class,
		Prerequisites: prerequisites,
	}, nil
}

// Create adds a new active class and returns its id.
func (s *ClassService) Create(ctx context.Context, p *Principal, courseID, semesterID int64, in ClassInput) (int64, error) {
	if err := requireAdmin(p); err != nil {
		return 0, err
	}
	if err := validateSchedules(in.Schedules); err != nil {
		return 0, err
	}

	var id int64
	err := s.classes.WithTx(ctx, func(tx *repository.ClassTx) error {
		var insertErr error
		id, insertErr = tx.Insert(ctx, courseID, semesterID, toClassFields(in))
		return insertErr
	})
	if err != nil {
		return 0, mapClassWriteError(err)
	}
	return id, nil
}

// Update replaces the editable fields of a class. Once students have registered,
// the schedule can no longer change, and the capacity cannot drop below the
// number of enrolled students.
func (s *ClassService) Update(ctx context.Context, p *Principal, classID int64, in ClassInput) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	if err := validateSchedules(in.Schedules); err != nil {
		return err
	}

	err := s.classes.WithTx(ctx, func(tx *repository.ClassTx) error {
		current, err := tx.LockClass(ctx, classID)
		if err != nil {
			return err
		}
		if current == nil {
			return ErrNotFound
		}
		if current.Status == repository.StatusCancelled {
			return ErrClassCancelled
		}
		if in.MaxCapacity < current.Enrolled {
			return ErrCapacityBelowEnrolled
		}

		fields := toClassFields(in)
		if current.Enrolled > 0 && !sameSchedules(current.Schedules, fields.Schedules) {
			return ErrScheduleLocked
		}
		if err := tx.UpdateFields(ctx, classID, fields); err != nil {
			return err
		}
		return tx.ReplaceSchedules(ctx, classID, fields.Schedules)
	})
	return mapClassWriteError(err)
}

// Cancel cancels a class instead of deleting it, so registrations keep a valid
// reference. Registrations of the class are cancelled in the same transaction.
func (s *ClassService) Cancel(ctx context.Context, p *Principal, classID int64) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	return s.classes.WithTx(ctx, func(tx *repository.ClassTx) error {
		current, err := tx.LockClass(ctx, classID)
		if err != nil {
			return err
		}
		if current == nil {
			return ErrNotFound
		}
		if current.Status == repository.StatusCancelled {
			return ErrClassCancelled
		}
		return tx.Cancel(ctx, classID)
	})
}

func isRegistrationOpen(semester repository.Semester, now time.Time) bool {
	return !now.Before(semester.RegistrationOpensAt) && !now.After(semester.RegistrationClosesAt)
}

func validateSchedules(schedules []ScheduleInput) error {
	for _, s := range schedules {
		if s.EndPeriod < s.StartPeriod {
			return ErrInvalidSchedule
		}
	}
	return nil
}

func toClassFields(in ClassInput) repository.ClassFields {
	schedules := make([]repository.Schedule, 0, len(in.Schedules))
	for _, s := range in.Schedules {
		schedules = append(schedules, repository.Schedule{
			DayOfWeek:   s.DayOfWeek,
			StartPeriod: s.StartPeriod,
			EndPeriod:   s.EndPeriod,
			Room:        s.Room,
		})
	}
	return repository.ClassFields{
		ClassCode:    in.ClassCode,
		LecturerName: in.LecturerName,
		MaxCapacity:  in.MaxCapacity,
		Schedules:    schedules,
	}
}

// sameSchedules compares two schedule lists as sets.
func sameSchedules(a, b []repository.Schedule) bool {
	if len(a) != len(b) {
		return false
	}
	ka, kb := scheduleKeys(a), scheduleKeys(b)
	for i := range ka {
		if ka[i] != kb[i] {
			return false
		}
	}
	return true
}

func scheduleKeys(schedules []repository.Schedule) []string {
	keys := make([]string, 0, len(schedules))
	for _, s := range schedules {
		keys = append(keys, fmt.Sprintf("%d|%d|%d|%s", s.DayOfWeek, s.StartPeriod, s.EndPeriod, s.Room))
	}
	sort.Strings(keys)
	return keys
}

func mapClassWriteError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, repository.ErrDuplicate):
		return ErrClassCodeTaken
	case errors.Is(err, repository.ErrInvalidReference):
		return ErrInvalidReference
	default:
		return err
	}
}
