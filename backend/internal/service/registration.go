package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Akapi895/course-registration/backend/internal/repository"
)

type RegistrationService struct {
	regs      *repository.RegistrationRepository
	classes   *repository.ClassRepository
	semesters *repository.SemesterRepository
}

func NewRegistrationService(
	regs *repository.RegistrationRepository,
	classes *repository.ClassRepository,
	semesters *repository.SemesterRepository,
) *RegistrationService {
	return &RegistrationService{regs: regs, classes: classes, semesters: semesters}
}

func (s *RegistrationService) Register(ctx context.Context, p *Principal, classID int64) (*repository.Registration, error) {
	if err := requireStudent(p); err != nil {
		return nil, err
	}

	class, err := s.classes.FindByID(ctx, classID)
	if err != nil {
		return nil, err
	}
	if class == nil {
		return nil, ErrNotFound
	}
	if class.Status == repository.StatusCancelled {
		return nil, ErrClassCancelled
	}

	semester, err := s.semesterOf(ctx, class.SemesterID)
	if err != nil {
		return nil, err
	}
	if !isRegistrationOpen(*semester, time.Now()) {
		return nil, ErrRegistrationClosed
	}

	var reg *repository.Registration
	err = s.regs.WithTx(ctx, func(tx *repository.RegistrationTx) error {
		var enrollErr error
		reg, enrollErr = s.enroll(ctx, tx, p.UserID, class, *semester)
		return enrollErr
	})
	if err != nil {
		return nil, err
	}
	return reg, nil
}

// enroll runs inside the registration transaction. The student row is locked
// first, so the rules below see every registration the student made before.
func (s *RegistrationService) enroll(
	ctx context.Context,
	tx *repository.RegistrationTx,
	studentID int64,
	class *repository.Class,
	semester repository.Semester,
) (*repository.Registration, error) {
	if err := tx.LockStudent(ctx, studentID); err != nil {
		return nil, err
	}

	registered, err := tx.IsRegistered(ctx, studentID, class.ID)
	if err != nil {
		return nil, err
	}
	if registered {
		return nil, ErrAlreadyRegistered
	}

	// The seat is claimed before the remaining rules. If one of them fails, the
	// transaction rolls back and the seat is released.
	claimed, err := tx.ClaimSeat(ctx, class.ID)
	if err != nil {
		return nil, err
	}
	if !claimed {
		status, err := tx.ClassStatus(ctx, class.ID)
		if err != nil {
			return nil, err
		}
		if status == repository.StatusCancelled {
			return nil, ErrClassCancelled
		}
		return nil, ErrClassFull
	}

	if err := checkNoScheduleConflict(ctx, tx, studentID, *class, semester.ID); err != nil {
		return nil, err
	}
	if err := checkPrerequisites(ctx, tx, studentID, class.CourseID); err != nil {
		return nil, err
	}
	if err := checkCreditLimit(ctx, tx, studentID, *class, semester); err != nil {
		return nil, err
	}

	return tx.Upsert(ctx, studentID, class.ID)
}

func (s *RegistrationService) Cancel(ctx context.Context, p *Principal, registrationID int64) error {
	if err := requireStudent(p); err != nil {
		return err
	}

	reg, err := s.regs.FindOwned(ctx, registrationID, p.UserID)
	if err != nil {
		return err
	}
	if reg == nil {
		return ErrRegistrationNotFound
	}
	if reg.Status != repository.StatusRegistered {
		return ErrRegistrationNotActive
	}

	class, err := s.classes.FindByID(ctx, reg.ClassID)
	if err != nil {
		return err
	}
	if class == nil {
		return fmt.Errorf("registration %d refers to missing class %d", reg.ID, reg.ClassID)
	}
	semester, err := s.semesterOf(ctx, class.SemesterID)
	if err != nil {
		return err
	}
	if !isRegistrationOpen(*semester, time.Now()) {
		return ErrRegistrationClosed
	}

	return s.regs.WithTx(ctx, func(tx *repository.RegistrationTx) error {
		if err := tx.LockStudent(ctx, p.UserID); err != nil {
			return err
		}
		cancelled, err := tx.CancelRegistration(ctx, reg.ID)
		if err != nil {
			return err
		}
		if !cancelled {
			return ErrRegistrationNotActive
		}
		return tx.ReleaseSeat(ctx, reg.ClassID)
	})
}

func (s *RegistrationService) ListRegistered(ctx context.Context, p *Principal) ([]repository.RegisteredClass, error) {
	if err := requireStudent(p); err != nil {
		return nil, err
	}
	return s.regs.ListRegistered(ctx, p.UserID)
}

func (s *RegistrationService) ListSchedules(ctx context.Context, p *Principal) ([]repository.ScheduleEntry, error) {
	if err := requireStudent(p); err != nil {
		return nil, err
	}
	return s.regs.ListSchedules(ctx, p.UserID)
}

func (s *RegistrationService) semesterOf(ctx context.Context, semesterID int64) (*repository.Semester, error) {
	semester, err := s.semesters.FindByID(ctx, semesterID)
	if err != nil {
		return nil, err
	}
	if semester == nil {
		return nil, fmt.Errorf("missing semester %d", semesterID)
	}
	return semester, nil
}

func checkNoScheduleConflict(ctx context.Context, tx *repository.RegistrationTx, studentID int64, class repository.Class, semesterID int64) error {
	registered, err := tx.RegisteredSchedules(ctx, studentID, semesterID)
	if err != nil {
		return err
	}
	for _, have := range registered {
		for _, want := range class.Schedules {
			if overlaps(have, want) {
				return ErrScheduleConflict
			}
		}
	}
	return nil
}

func overlaps(a, b repository.Schedule) bool {
	return a.DayOfWeek == b.DayOfWeek && a.StartPeriod <= b.EndPeriod && b.StartPeriod <= a.EndPeriod
}

func checkPrerequisites(ctx context.Context, tx *repository.RegistrationTx, studentID, courseID int64) error {
	required, err := tx.PrerequisiteCourseIDs(ctx, courseID)
	if err != nil {
		return err
	}
	passedList, err := tx.PassedCourseIDs(ctx, studentID)
	if err != nil {
		return err
	}
	passed := make(map[int64]bool, len(passedList))
	for _, id := range passedList {
		passed[id] = true
	}
	for _, id := range required {
		if !passed[id] {
			return ErrPrerequisiteNotMet
		}
	}
	return nil
}

func checkCreditLimit(ctx context.Context, tx *repository.RegistrationTx, studentID int64, class repository.Class, semester repository.Semester) error {
	total, err := tx.RegisteredCredits(ctx, studentID, semester.ID)
	if err != nil {
		return err
	}
	if total+class.Credits > semester.MaxCredits {
		return ErrCreditLimitExceeded
	}
	return nil
}
