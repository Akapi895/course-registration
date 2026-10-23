package service

import "github.com/Akapi895/course-registration/backend/internal/repository"

// Principal is the authenticated caller of a request.
type Principal struct {
	UserID int64
	Role   string
	SID    string
}

func requireStudent(p *Principal) error {
	if p.Role != repository.RoleStudent {
		return ErrForbidden
	}
	return nil
}

func requireAdmin(p *Principal) error {
	if p.Role != repository.RoleAdmin {
		return ErrForbidden
	}
	return nil
}
