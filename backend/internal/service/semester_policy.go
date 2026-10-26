package service

import "github.com/Akapi895/course-registration/backend/internal/repository"

// withCreditLimit applies the optional runtime limit consistently to reads and enrollment.
// Zero preserves the semester's database configuration.
func withCreditLimit(semester repository.Semester, maxCredits int) repository.Semester {
	if maxCredits > 0 {
		semester.MaxCredits = maxCredits
	}
	return semester
}
