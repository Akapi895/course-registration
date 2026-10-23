package service

import (
	"context"

	"github.com/Akapi895/course-registration/backend/internal/repository"
)

type StudentService struct {
	users *repository.UserRepository
}

func NewStudentService(users *repository.UserRepository) *StudentService {
	return &StudentService{users: users}
}

type StudentProfile struct {
	FullName string
	Faculty  *string
	Major    *string
}

func (s *StudentService) Get(ctx context.Context, p *Principal, studentID int64) (*repository.User, error) {
	if !canAccessStudent(p, studentID) {
		return nil, ErrForbidden
	}
	user, err := s.users.FindByID(ctx, studentID)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Role != repository.RoleStudent {
		return nil, ErrNotFound
	}
	return user, nil
}

func (s *StudentService) Update(ctx context.Context, p *Principal, studentID int64, profile StudentProfile) (*repository.User, error) {
	if !canAccessStudent(p, studentID) {
		return nil, ErrForbidden
	}
	user, err := s.users.UpdateProfile(ctx, studentID, profile.FullName, profile.Faculty, profile.Major)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrNotFound
	}
	return user, nil
}

func canAccessStudent(p *Principal, studentID int64) bool {
	return p.Role == repository.RoleAdmin || p.UserID == studentID
}
