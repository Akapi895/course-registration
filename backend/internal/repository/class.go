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
	Faculty      string
	Major        *string
	SemesterID   int64
	SemesterName string
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

// ClassFields holds the editable attributes of a class.
type ClassFields struct {
	ClassCode    string
	LecturerName string
	MaxCapacity  int
	Schedules    []Schedule
}

type ClassRepository struct {
	db *pgxpool.Pool
}

func NewClassRepository(db *pgxpool.Pool) *ClassRepository {
	return &ClassRepository{db: db}
}

// querier is implemented by both *pgxpool.Pool and pgx.Tx.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

const classSelect = `
	SELECT cc.id, cc.course_id, c.code, c.name, c.credits, c.faculty, c.major, cc.semester_id, s.name,
	       cc.class_code, cc.lecturer_name, cc.max_capacity, cc.enrolled, cc.status
	FROM course_classes cc
	JOIN courses c ON c.id = cc.course_id
	JOIN semesters s ON s.id = cc.semester_id`

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
	class.Schedules, err = schedulesOf(ctx, r.db, id)
	if err != nil {
		return nil, err
	}
	return &class, nil
}

// WithTx runs fn inside one database transaction. It commits when fn returns nil.
func (r *ClassRepository) WithTx(ctx context.Context, fn func(tx *ClassTx) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(&ClassTx{tx: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ClassTx exposes the statements of an administrative class change.
type ClassTx struct {
	tx pgx.Tx
}

// LockClass locks the class row. Registrations claim seats under the same lock,
// so the decision made here cannot race with an enrollment.
func (t *ClassTx) LockClass(ctx context.Context, id int64) (*Class, error) {
	class, err := scanClass(t.tx.QueryRow(ctx, classSelect+` WHERE cc.id = $1 FOR UPDATE OF cc`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	class.Schedules, err = schedulesOf(ctx, t.tx, id)
	if err != nil {
		return nil, err
	}
	return &class, nil
}

// Insert stores a new active class with its schedules and returns its id.
func (t *ClassTx) Insert(ctx context.Context, courseID, semesterID int64, fields ClassFields) (int64, error) {
	var id int64
	err := t.tx.QueryRow(ctx,
		`INSERT INTO course_classes (course_id, semester_id, class_code, lecturer_name, max_capacity)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id`,
		courseID, semesterID, fields.ClassCode, fields.LecturerName, fields.MaxCapacity,
	).Scan(&id)
	if err != nil {
		return 0, translateError(err)
	}
	if err := t.insertSchedules(ctx, id, fields.Schedules); err != nil {
		return 0, err
	}
	return id, nil
}

func (t *ClassTx) UpdateFields(ctx context.Context, id int64, fields ClassFields) error {
	_, err := t.tx.Exec(ctx,
		`UPDATE course_classes SET class_code = $2, lecturer_name = $3, max_capacity = $4
		 WHERE id = $1`,
		id, fields.ClassCode, fields.LecturerName, fields.MaxCapacity,
	)
	return translateError(err)
}

func (t *ClassTx) ReplaceSchedules(ctx context.Context, classID int64, schedules []Schedule) error {
	if _, err := t.tx.Exec(ctx, `DELETE FROM class_schedules WHERE class_id = $1`, classID); err != nil {
		return err
	}
	return t.insertSchedules(ctx, classID, schedules)
}

// Cancel marks the class cancelled, cancels its active registrations and
// releases every seat.
func (t *ClassTx) Cancel(ctx context.Context, classID int64) error {
	if _, err := t.tx.Exec(ctx,
		`UPDATE registrations SET status = 'cancelled'
		 WHERE class_id = $1 AND status = 'registered'`,
		classID,
	); err != nil {
		return err
	}
	_, err := t.tx.Exec(ctx,
		`UPDATE course_classes SET status = 'cancelled', enrolled = 0 WHERE id = $1`,
		classID,
	)
	return err
}

func (t *ClassTx) insertSchedules(ctx context.Context, classID int64, schedules []Schedule) error {
	for _, s := range schedules {
		if _, err := t.tx.Exec(ctx,
			`INSERT INTO class_schedules (class_id, day_of_week, start_period, end_period, room)
			 VALUES ($1, $2, $3, $4, $5)`,
			classID, s.DayOfWeek, s.StartPeriod, s.EndPeriod, s.Room,
		); err != nil {
			return err
		}
	}
	return nil
}

func schedulesOf(ctx context.Context, q querier, classID int64) ([]Schedule, error) {
	rows, err := q.Query(ctx,
		`SELECT day_of_week, start_period, end_period, room
		 FROM class_schedules
		 WHERE class_id = $1
		 ORDER BY day_of_week, start_period`,
		classID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Schedule, error) {
		var s Schedule
		err := row.Scan(&s.DayOfWeek, &s.StartPeriod, &s.EndPeriod, &s.Room)
		return s, err
	})
}

func scanClass(row pgx.Row) (Class, error) {
	var c Class
	err := row.Scan(
		&c.ID, &c.CourseID, &c.CourseCode, &c.CourseName, &c.Credits, &c.Faculty, &c.Major, &c.SemesterID, &c.SemesterName,
		&c.ClassCode, &c.LecturerName, &c.MaxCapacity, &c.Enrolled, &c.Status,
	)
	return c, err
}

// Prerequisite is a course that must be passed before registering for another.
type Prerequisite struct {
	CourseID   int64
	CourseCode string
	CourseName string
	// Passed reports whether the asking student passed the course; false when no student is given.
	Passed bool
}

// Prerequisites lists the prerequisite courses of a course, ordered by code.
// When studentID is not nil, Passed tells whether that student passed each one.
func (r *ClassRepository) Prerequisites(ctx context.Context, courseID int64, studentID *int64) ([]Prerequisite, error) {
	rows, err := r.db.Query(ctx, `
		SELECT p.id, p.code, p.name, COALESCE(res.passed, false)
		FROM course_prerequisites cp
		JOIN courses p ON p.id = cp.prerequisite_course_id
		LEFT JOIN course_results res ON res.course_id = p.id AND res.student_id = $2::bigint
		WHERE cp.course_id = $1
		ORDER BY p.code`,
		courseID, studentID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Prerequisite, error) {
		var p Prerequisite
		err := row.Scan(&p.CourseID, &p.CourseCode, &p.CourseName, &p.Passed)
		return p, err
	})
}
