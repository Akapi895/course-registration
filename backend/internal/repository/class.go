package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Class struct {
	ID           int64
	CourseID     int64
	CourseCode   string
	CourseName   string
	Credits      int
	SemesterID   int64
	ClassCode    string
	LecturerName string
	MaxCapacity  int
	Enrolled     int
	Status       string
	Schedules    []Schedule
}

type Schedule struct {
	DayOfWeek   int
	StartPeriod int
	EndPeriod   int
	Room        string
}

type ClassRepository struct {
	db *pgxpool.Pool
}

func NewClassRepository(db *pgxpool.Pool) *ClassRepository {
	return &ClassRepository{db: db}
}

const classSelect = `
	SELECT cc.id, cc.course_id, c.code, c.name, c.credits, cc.semester_id,
	       cc.class_code, cc.lecturer_name, cc.max_capacity, cc.enrolled, cc.status
	FROM course_classes cc
	JOIN courses c ON c.id = cc.course_id`

// ListActiveBySemester returns the active classes of a semester. A nil filter
// matches every value.
func (r *ClassRepository) ListActiveBySemester(ctx context.Context, semesterID int64, faculty, major *string) ([]Class, error) {
	rows, err := r.db.Query(ctx, classSelect+`
		WHERE cc.semester_id = $1
		  AND cc.status = 'active'
		  AND ($2::text IS NULL OR c.faculty = $2)
		  AND ($3::text IS NULL OR c.major = $3)
		ORDER BY cc.class_code`,
		semesterID, faculty, major,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Class, error) {
		return scanClass(row)
	})
}

// FindByID returns the class with its schedules, or nil when none exists.
// Cancelled classes are returned as well.
func (r *ClassRepository) FindByID(ctx context.Context, id int64) (*Class, error) {
	class, err := scanClass(r.db.QueryRow(ctx, classSelect+` WHERE cc.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx,
		`SELECT day_of_week, start_period, end_period, room
		 FROM class_schedules
		 WHERE class_id = $1
		 ORDER BY day_of_week, start_period`,
		id,
	)
	if err != nil {
		return nil, err
	}
	class.Schedules, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Schedule, error) {
		var s Schedule
		err := row.Scan(&s.DayOfWeek, &s.StartPeriod, &s.EndPeriod, &s.Room)
		return s, err
	})
	if err != nil {
		return nil, err
	}
	return &class, nil
}

func scanClass(row pgx.Row) (Class, error) {
	var c Class
	err := row.Scan(
		&c.ID, &c.CourseID, &c.CourseCode, &c.CourseName, &c.Credits, &c.SemesterID,
		&c.ClassCode, &c.LecturerName, &c.MaxCapacity, &c.Enrolled, &c.Status,
	)
	return c, err
}
