package service

import (
	"context"
	"fmt"
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

// ClassView is a class with its registration state derived from the semester window.
type ClassView struct {
	repository.Class
	RegistrationOpen bool
}

// ListCurrent returns the active classes of the current semester. It returns an
// empty list when no semester has opened for registration yet.
func (s *ClassService) ListCurrent(ctx context.Context, filter ClassFilter) ([]ClassView, error) {
	now := time.Now()
	semester, err := s.semesters.FindCurrent(ctx, now)
	if err != nil {
		return nil, err
	}
	if semester == nil {
		return []ClassView{}, nil
	}

	classes, err := s.classes.ListActiveBySemester(ctx, semester.ID, filter.Faculty, filter.Major)
	if err != nil {
		return nil, err
	}

	open := isRegistrationOpen(*semester, now)
	views := make([]ClassView, 0, len(classes))
	for _, c := range classes {
		views = append(views, ClassView{Class: c, RegistrationOpen: open})
	}
	return views, nil
}

func (s *ClassService) Get(ctx context.Context, classID int64) (*ClassView, error) {
	class, err := s.classes.FindByID(ctx, classID)
	if err != nil {
		return nil, err
	}
	if class == nil {
		return nil, ErrNotFound
	}

	semester, err := s.semesters.FindByID(ctx, class.SemesterID)
	if err != nil {
		return nil, err
	}
	if semester == nil {
		return nil, fmt.Errorf("class %d refers to missing semester %d", class.ID, class.SemesterID)
	}

	return &ClassView{Class: *class, RegistrationOpen: isRegistrationOpen(*semester, time.Now())}, nil
}

func isRegistrationOpen(semester repository.Semester, now time.Time) bool {
	return !now.Before(semester.RegistrationOpensAt) && !now.After(semester.RegistrationClosesAt)
}
