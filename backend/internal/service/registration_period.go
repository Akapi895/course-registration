package service

import (
	"context"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/repository"
)

type RegistrationPeriodService struct {
	semesters *repository.SemesterRepository
}

func NewRegistrationPeriodService(semesters *repository.SemesterRepository) *RegistrationPeriodService {
	return &RegistrationPeriodService{semesters: semesters}
}

// Update sets the registration window of a semester.
func (s *RegistrationPeriodService) Update(ctx context.Context, p *Principal, semesterID int64, opensAt, closesAt time.Time) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	if !closesAt.After(opensAt) {
		return ErrInvalidRegistrationPeriod
	}

	updated, err := s.semesters.UpdateRegistrationPeriod(ctx, semesterID, opensAt, closesAt)
	if err != nil {
		return mapClassWriteError(err)
	}
	if !updated {
		return ErrInvalidReference
	}
	return nil
}
