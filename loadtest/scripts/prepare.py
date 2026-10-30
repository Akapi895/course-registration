"""Log in every shared account once and create the fixture classes the scenarios use.

Students hold one session at a time and wait out a cooldown after it ends, so scenarios borrow the
tokens stored here instead of logging in themselves. All fixture classes are sections of one
prerequisite-free course, each on a weekday/period slot of its own.
"""
import json
import os
import sys
import uuid
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import psycopg

from common import (
    ADMIN_USERNAMES, BASE_URL, DATABASE_URL, LOAD_STUDENTS, LOAD_USERNAMES, POOL_USERNAMES,
    RESULTS_DIR, auth_header, login, read_json, wait_until_healthy, write_json,
)

CATALOG = Path(os.environ.get("CATALOG_PATH", Path(__file__).resolve().parents[2] / "database/data/catalog.json"))


def slot(day: int, period: int) -> dict:
    return {"day_of_week": day, "start_period": period, "end_period": period, "room": "LOADTEST"}


SMALL_SLOT = slot(7, 1)
WIDE_SLOTS = [slot(day, 1) for day in (2, 3, 4, 5, 6)]
CANCEL_TARGET_SLOT = slot(2, 3)
CONFLICT_SLOT = slot(2, 10)
CREDIT_SLOTS = [slot(day, period) for day in (3, 4, 5, 6, 7) for period in (5, 8)]


def prerequisite_free_course() -> tuple[int, int]:
    """(course_id, credits); seeding numbers courses by their position in catalog.json."""
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    with_prerequisite = {code for code, _ in catalog["prerequisites"]}
    for course_id, course in enumerate(catalog["courses"], 1):
        if course["code"] not in with_prerequisite:
            return course_id, course["credits"]
    raise RuntimeError("every course has a prerequisite")


def create_class(client: httpx.Client, token: str, course_id: int, semester_id: int,
                  capacity: int, schedule: dict, suffix: str) -> dict:
    body = {
        "course_id": course_id, "semester_id": semester_id,
        "class_code": f"LOADTEST-{suffix}-{uuid.uuid4().hex[:6]}", "lecturer_name": "Loadtest Fixture",
        "max_capacity": capacity, "schedules": [schedule],
    }
    response = client.post(f"{BASE_URL}/api/classes", json=body, headers=auth_header(token))
    if response.status_code != 201:
        raise RuntimeError(f"cannot create {suffix}: {response.status_code} {response.text}")
    return {"id": response.json()["data"]["id"], "capacity": capacity, "schedule": schedule}


def log_in_all(client: httpx.Client) -> dict[str, str]:
    tokens, failures = {}, []
    accounts = POOL_USERNAMES + ADMIN_USERNAMES + LOAD_USERNAMES
    def authenticate(username):
        return username, login(client, username)
    # Password checks are real API calls, excluded from measured workloads.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, (username, response) in enumerate(pool.map(authenticate, accounts), 1):
            if response.status_code == 200:
                tokens[username] = response.json()["data"]["access_token"]
            else:
                failures.append(f"{username}: {response.status_code} {response.text}")
            if index % 200 == 0:
                print(f"login preparation: {index}/{len(accounts)}", flush=True)
    if failures:
        raise RuntimeError("login preparation failed; use a fresh run:\n" + "\n".join(failures))
    return tokens


def add_accounts(usernames):
    """Extend the disposable database after the exact demo fixture has been verified."""
    with psycopg.connect(DATABASE_URL) as conn:
        password_hash = conn.execute("SELECT password_hash FROM users WHERE username='student001'").fetchone()[0]
        conn.cursor().executemany("""
            INSERT INTO users (username, password_hash, role, full_name, student_code, faculty, major)
            VALUES (%s, %s, 'student', %s, %s, 'Loadtest', 'Loadtest') ON CONFLICT (username) DO NOTHING
        """, [(u, password_hash, u, f"LOAD-{u}") for u in usernames])


def create_fixtures(client: httpx.Client, admin_token: str) -> dict:
    course_id, credits = prerequisite_free_course()
    catalog = client.get(f"{BASE_URL}/api/classes", headers=auth_header(admin_token)).json()["data"]
    semester = catalog["semester"]
    if semester is None:
        raise RuntimeError("no open semester; seed with a REFERENCE_DATE close to today")
    semester_id, max_credits = semester["id"], semester["max_credits"]

    def make(capacity: int, schedule: dict, suffix: str) -> dict:
        return create_class(client, admin_token, course_id, semester_id, capacity, schedule, suffix)

    sections = max(5, max_credits // credits + 2)
    fixtures = {
        "semester_id": semester_id, "course_id": course_id, "course_credits": credits, "max_credits": max_credits,
        "small": make(3, SMALL_SLOT, "SMALL"),
        "wide": [make(20, s, f"WIDE{i}") for i, s in enumerate(WIDE_SLOTS)],
        "cancel_target": make(5, CANCEL_TARGET_SLOT, "CANCEL"),
        "credit_sections": [make(50, s, f"CREDIT{i}") for i, s in enumerate((CREDIT_SLOTS * 2)[:sections])],
        "conflict_pair": [make(20, CONFLICT_SLOT, f"CONFLICT{i}") for i in range(2)],
    }
    sections = max(1, math.ceil(LOAD_STUDENTS / 50))
    fixtures["spread"] = [[make(60, slot(day, 1), f"SPREAD{day}-{i}") for i in range(sections)]
                          for day in (2, 3, 4, 5, 6)]
    # One existing registration per load account makes read endpoints nonempty.
    baseline = [make(50, slot(2, 15), f"BASE-{i}") for i in range(sections)]
    with psycopg.connect(DATABASE_URL) as conn:
        for index, username in enumerate(LOAD_USERNAMES):
            class_id = baseline[index // 50]["id"]
            conn.execute("INSERT INTO registrations (student_id, class_id) SELECT id, %s FROM users WHERE username=%s",
                         (class_id, username))
        conn.execute("""UPDATE course_classes cc SET enrolled=(SELECT count(*) FROM registrations r WHERE r.class_id=cc.id)
                        WHERE cc.id = ANY(%s)""", ([c["id"] for c in baseline],))
    fixtures["baseline"] = baseline
    fixtures["load_students"] = LOAD_STUDENTS
    return fixtures


def reset_load_registrations():
    """Call only after recording invariants for the previous workload."""
    fixtures = read_json("test_classes.json")
    class_ids = [c["id"] for band in fixtures["spread"] for c in band] + [fixtures["small"]["id"]]
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("DELETE FROM registrations WHERE class_id = ANY(%s)", (class_ids,))
        conn.execute("UPDATE course_classes SET enrolled=0 WHERE id = ANY(%s)", (class_ids,))


def validate_tokens():
    tokens = read_json("tokens.json")
    required = LOAD_USERNAMES + POOL_USERNAMES + ADMIN_USERNAMES
    if any(u not in tokens for u in required):
        raise RuntimeError("token pool does not match LOADTEST_STUDENTS; use a fresh notebook run")
    with httpx.Client(timeout=10) as client:
        for username in ("student001", "admin1", LOAD_USERNAMES[0], LOAD_USERNAMES[-1]):
            response = client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(tokens[username]))
            if response.status_code != 200:
                raise RuntimeError(f"invalid token for {username}: HTTP {response.status_code}; use a fresh run")
    with psycopg.connect(DATABASE_URL) as conn:
        active = conn.execute("""SELECT count(DISTINCT u.username) FROM users u JOIN auth_sessions s ON s.user_id=u.id
            WHERE u.username=ANY(%s) AND s.logged_out_at IS NULL AND s.expires_at > now() + interval '10 minutes'
        """, (required,)).fetchone()[0]
    if active != len(required):
        raise RuntimeError("sessions are missing or expire within 10 minutes; start a fresh run")


def main() -> None:
    if (RESULTS_DIR / "tokens.json").exists():
        validate_tokens()
        return
    if (RESULTS_DIR / "prepare.json").exists():
        raise RuntimeError("an earlier preparation was interrupted; use a fresh notebook run")
    write_json("prepare.json", {"status": "RUNNING", "load_students": LOAD_STUDENTS})
    try:
        add_accounts(LOAD_USERNAMES)
        with httpx.Client(timeout=60) as client:
            wait_until_healthy(client)
            tokens = log_in_all(client)
            fixtures = create_fixtures(client, tokens["admin1"])
        write_json("test_classes.json", fixtures)
        write_json("tokens.json", tokens)
        write_json("prepare.json", {"status": "COMPLETED", "load_students": LOAD_STUDENTS})
    except BaseException as exc:
        write_json("prepare.json", {"status": "ERROR", "error": str(exc)})
        raise
    print(f"prepared {len(tokens)} tokens and fixtures for course {fixtures['course_id']} "
          f"({fixtures['course_credits']} credits, limit {fixtures['max_credits']})")


if __name__ == "__main__":
    main()
