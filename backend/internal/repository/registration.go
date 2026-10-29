package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	StatusActive    = "active"
	StatusCancelled = "cancelled"
)

type Registration struct {
	ID           int64
	ClassID      int64
	RegisteredAt time.Time
}

type RegisteredClass struct {
	ID           int64
	ClassID      int64
	ClassCode    string
	CourseCode   string
	CourseName   string
	Credits      int
	RegisteredAt time.Time
}

type ScheduleEntry struct {
	ClassID     int64
	ClassCode   string
	CourseCode  string
	CourseName  string
	DayOfWeek   int
	StartPeriod int
	EndPeriod   int
	Room        string
}

type RegistrationRepository struct {
	db *pgxpool.Pool
}

func NewRegistrationRepository(db *pgxpool.Pool) *RegistrationRepository {
	return &RegistrationRepository{db: db}
}

// FindOwned returns nil, nil when the registration does not exist or belongs to another student.
func (r *RegistrationRepository) FindOwned(ctx context.Context, id, studentID int64) (*Registration, error) {
	reg, err := scanRegistration(r.db.QueryRow(ctx,
		`SELECT id, class_id, registered_at
		 FROM registrations WHERE id = $1 AND student_id = $2`,
		id, studentID,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return reg, err
}

func (r *RegistrationRepository) ListRegistered(ctx context.Context, studentID int64) ([]RegisteredClass, error) {
	rows, err := r.db.Query(ctx,
		`SELECT r.id, r.class_id, cc.class_code, c.code, c.name, c.credits, r.registered_at
		 FROM registrations r
		 JOIN course_classes cc ON cc.id = r.class_id
		 JOIN courses c ON c.id = cc.course_id
		 WHERE r.student_id = $1
		 ORDER BY r.registered_at`,
		studentID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (RegisteredClass, error) {
		var rc RegisteredClass
		err := row.Scan(&rc.ID, &rc.ClassID, &rc.ClassCode, &rc.CourseCode, &rc.CourseName,
			&rc.Credits, &rc.RegisteredAt)
		return rc, err
	})
}

func (r *RegistrationRepository) ListSchedules(ctx context.Context, studentID int64) ([]ScheduleEntry, error) {
	rows, err := r.db.Query(ctx,
		`SELECT cc.id, cc.class_code, c.code, c.name, s.day_of_week, s.start_period, s.end_period, s.room
		 FROM registrations r
		 JOIN course_classes cc ON cc.id = r.class_id
		 JOIN courses c ON c.id = cc.course_id
		 JOIN class_schedules s ON s.class_id = cc.id
		 WHERE r.student_id = $1
		 ORDER BY cc.class_code, s.day_of_week, s.start_period`,
		studentID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ScheduleEntry, error) {
		var e ScheduleEntry
		err := row.Scan(&e.ClassID, &e.ClassCode, &e.CourseCode, &e.CourseName,
			&e.DayOfWeek, &e.StartPeriod, &e.EndPeriod, &e.Room)
		return e, err
	})
}

// WithTx runs fn inside one database transaction. It commits when fn returns nil.
func (r *RegistrationRepository) WithTx(ctx context.Context, fn func(tx *RegistrationTx) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if err := fn(&RegistrationTx{tx: tx}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RegistrationTx exposes the statements used by an enrollment or cancellation
// transaction. All of them run on the same connection.
type RegistrationTx struct {
	tx pgx.Tx
}

// LockStudent serializes the registration changes of one student.
func (t *RegistrationTx) LockStudent(ctx context.Context, studentID int64) error {
	_, err := t.tx.Exec(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, studentID)
	return err
}

// LockClass locks the class row before its registrations are changed.
func (t *RegistrationTx) LockClass(ctx context.Context, classID int64) error {
	_, err := t.tx.Exec(ctx, `SELECT 1 FROM course_classes WHERE id = $1 FOR UPDATE`, classID)
	return err
}

func (t *RegistrationTx) IsRegistered(ctx context.Context, studentID, classID int64) (bool, error) {
	var ok bool
	err := t.tx.QueryRow(ctx,
		`SELECT EXISTS (
		   SELECT 1 FROM registrations
		   WHERE student_id = $1 AND class_id = $2)`,
		studentID, classID,
	).Scan(&ok)
	return ok, err
}

// RegisteredSchedules returns the class schedules of the student's
// registrations in one semester.
func (t *RegistrationTx) RegisteredSchedules(ctx context.Context, studentID, semesterID int64) ([]Schedule, error) {
	rows, err := t.tx.Query(ctx,
		`SELECT s.day_of_week, s.start_period, s.end_period, s.room
		 FROM registrations r
		 JOIN course_classes cc ON cc.id = r.class_id
		 JOIN class_schedules s ON s.class_id = cc.id
		 WHERE r.student_id = $1 AND cc.semester_id = $2`,
		studentID, semesterID,
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

// RegisteredCredits returns the total credits of the student's
// registrations in one semester.
func (t *RegistrationTx) RegisteredCredits(ctx context.Context, studentID, semesterID int64) (int, error) {
	var total int
	err := t.tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(c.credits), 0)
		 FROM registrations r
		 JOIN course_classes cc ON cc.id = r.class_id
		 JOIN courses c ON c.id = cc.course_id
		 WHERE r.student_id = $1 AND cc.semester_id = $2`,
		studentID, semesterID,
	).Scan(&total)
	return total, err
}

func (t *RegistrationTx) PrerequisiteCourseIDs(ctx context.Context, courseID int64) ([]int64, error) {
	rows, err := t.tx.Query(ctx,
		`SELECT prerequisite_course_id FROM course_prerequisites WHERE course_id = $1`,
		courseID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[int64])
}

// PassedCourseIDs returns the courses the student has passed.
func (t *RegistrationTx) PassedCourseIDs(ctx context.Context, studentID int64) ([]int64, error) {
	rows, err := t.tx.Query(ctx,
		`SELECT course_id FROM course_results WHERE student_id = $1 AND passed`,
		studentID,
	)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[int64])
}

// ClaimSeat takes one seat of an active class that still has capacity. It
// reports false when the class is cancelled or full.
func (t *RegistrationTx) ClaimSeat(ctx context.Context, classID int64) (bool, error) {
	tag, err := t.tx.Exec(ctx,
		`UPDATE course_classes SET enrolled = enrolled + 1
		 WHERE id = $1 AND status = 'active' AND enrolled < max_capacity`,
		classID,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (t *RegistrationTx) ClassStatus(ctx context.Context, classID int64) (string, error) {
	var status string
	err := t.tx.QueryRow(ctx, `SELECT status FROM course_classes WHERE id = $1`, classID).Scan(&status)
	return status, err
}

// ClassSchedules reads the current schedules on the registration transaction.
func (t *RegistrationTx) ClassSchedules(ctx context.Context, classID int64) ([]Schedule, error) {
	return schedulesOf(ctx, t.tx, classID)
}

func (t *RegistrationTx) ReleaseSeat(ctx context.Context, classID int64) error {
	_, err := t.tx.Exec(ctx, `UPDATE course_classes SET enrolled = enrolled - 1 WHERE id = $1`, classID)
	return err
}

// Insert creates a new registration. Cancellation deletes the previous row.
func (t *RegistrationTx) Insert(ctx context.Context, studentID, classID int64) (*Registration, error) {
	reg, err := scanRegistration(t.tx.QueryRow(ctx,
		`INSERT INTO registrations (student_id, class_id)
		 VALUES ($1, $2)
		 RETURNING id, class_id, registered_at`,
		studentID, classID,
	))
	return reg, translateError(err)
}

// CancelRegistration deletes the registration and reports false when it no longer exists.
func (t *RegistrationTx) CancelRegistration(ctx context.Context, registrationID int64) (bool, error) {
	tag, err := t.tx.Exec(ctx,
		`DELETE FROM registrations WHERE id = $1`,
		registrationID,
	)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func scanRegistration(row pgx.Row) (*Registration, error) {
	var reg Registration
	err := row.Scan(&reg.ID, &reg.ClassID, &reg.RegisteredAt)
	if err != nil {
		return nil, err
	}
	return &reg, nil
}
