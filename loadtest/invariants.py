"""Data-integrity checks run straight against PostgreSQL; exit status 1 if any invariant is broken."""
import os
import sys
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from common import write_json

DATABASE_URL = os.environ["DATABASE_URL"]
# When set, the API enforces MAX_CREDITS instead of semesters.max_credits (the column is never updated).
MAX_CREDITS = int(os.environ["MAX_CREDITS"]) if os.environ.get("MAX_CREDITS") else None

REGISTERED_SLOTS = """
    SELECT r.student_id, r.class_id, cc.semester_id, cs.day_of_week, cs.start_period, cs.end_period
    FROM registrations r
    JOIN course_classes cc ON cc.id = r.class_id
    JOIN class_schedules cs ON cs.class_id = cc.id
"""

CHECKS = {
    "enrolled_within_capacity": """
        SELECT id, class_code, enrolled, max_capacity FROM course_classes
        WHERE enrolled > max_capacity OR enrolled < 0
    """,
    "enrolled_matches_registrations": """
        SELECT cc.id, cc.class_code, cc.enrolled, COALESCE(r.n, 0) AS actual
        FROM course_classes cc
        LEFT JOIN (SELECT class_id, count(*) AS n FROM registrations GROUP BY class_id) r ON r.class_id = cc.id
        WHERE cc.enrolled <> COALESCE(r.n, 0)
    """,
    "no_duplicate_registration": """
        SELECT student_id, class_id, count(*) AS n FROM registrations
        GROUP BY student_id, class_id HAVING count(*) > 1
    """,
    "no_registration_on_cancelled_class": """
        SELECT r.id, r.student_id, r.class_id FROM registrations r
        JOIN course_classes cc ON cc.id = r.class_id WHERE cc.status = 'cancelled'
    """,
    "credit_limit_respected": """
        SELECT r.student_id, cc.semester_id, SUM(c.credits) AS total,
               COALESCE(%(override)s, s.max_credits) AS credit_limit
        FROM registrations r
        JOIN course_classes cc ON cc.id = r.class_id
        JOIN courses c ON c.id = cc.course_id
        JOIN semesters s ON s.id = cc.semester_id
        GROUP BY r.student_id, cc.semester_id, s.max_credits
        HAVING SUM(c.credits) > COALESCE(%(override)s, s.max_credits)
    """,
    "no_schedule_conflict": f"""
        SELECT a.student_id, a.class_id AS class_a, b.class_id AS class_b
        FROM ({REGISTERED_SLOTS}) a JOIN ({REGISTERED_SLOTS}) b
          ON a.student_id = b.student_id AND a.semester_id = b.semester_id AND a.class_id < b.class_id
         AND a.day_of_week = b.day_of_week AND a.start_period <= b.end_period AND b.start_period <= a.end_period
    """,
    "one_active_session_per_student": """
        SELECT s.user_id, u.username, count(*) AS active_sessions
        FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE u.role = 'student' AND s.logged_out_at IS NULL AND now() < s.expires_at
        GROUP BY s.user_id, u.username HAVING count(*) > 1
    """,
    "logout_not_after_expiry": """
        SELECT id, user_id, expires_at, logged_out_at FROM auth_sessions
        WHERE logged_out_at IS NOT NULL AND logged_out_at > expires_at
    """,
}


def check(name="invariants_report.json"):
    violations = {}
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        for check_name, query in CHECKS.items():
            rows = conn.execute(query, {"override": MAX_CREDITS}).fetchall()
            if rows:
                violations[check_name] = rows
        counts = {table: conn.execute(f"SELECT count(*) AS n FROM {table}").fetchone()["n"]
                  for table in ("users", "course_classes", "registrations", "auth_sessions")}

    result = {
        "checks": len(CHECKS), "passed": not violations,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "table_counts": counts,
        "violation_counts": {key: len(rows) for key, rows in violations.items()},
        "violations": {name: rows[:50] for name, rows in violations.items()},
    }
    write_json(name, result)
    if not violations:
        print(f"PASS: {len(CHECKS)} invariants hold")
        return result
    print(f"FAIL: {len(violations)}/{len(CHECKS)} invariants violated")
    for name, rows in violations.items():
        print(f"  {name}: {len(rows)} rows, e.g. {rows[0]}")
    return result


if __name__ == "__main__":
    sys.exit(0 if check()["passed"] else 1)
