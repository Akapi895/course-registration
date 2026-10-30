"""Concurrency checks: N requests released at once through a barrier, repeated for several rounds.

A violation is an outcome that breaks an invariant the API must keep. Zero violations over many rounds
is evidence, not proof, so the report records how many rounds ran. B10 closes the live registration
window: it only runs with `--only b10` and the database must be reseeded afterwards.
"""
import argparse
import base64
import json
import os
import random
import threading
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, wait
from typing import Callable

import httpx
import psycopg

from common import (
    BASE_URL, DATABASE_URL, DEMO_PASSWORD, POOL_USERNAMES, RACE_LOGIN_RESERVED, RACE_LOGOUT_RESERVED, Code,
    RESULTS_DIR, auth_header, fail_code, read_json, violation_count, write_json,
)
from prepare import create_class
from prepare import add_accounts
import invariants


class IntegrityFailure(RuntimeError):
    pass


def response_outcome(response):
    if isinstance(response, Exception):
        return {"transport_error": type(response).__name__, "message": str(response)[:200]}
    result = {"http": response.status_code, "code": fail_code(response), "elapsed_ms": round(response.elapsed.total_seconds() * 1000, 2)}
    if response.status_code >= 400:
        result["body"] = response.text[:400]
    else:
        try:
            data = response.json().get("data", {})
            if isinstance(data, dict) and "results" in data:
                result["registration_results"] = data["results"]
        except (ValueError, AttributeError):
            result["protocol_error"] = "invalid response envelope"
    return result

DEFAULT_ROUNDS = 10
STUDENT_PARALLELISM_LEVELS = (8, 32, min(100, len(POOL_USERNAMES)))
SAME_ACCOUNT_PARALLELISM_LEVELS = (8, 32, 128)
CURRENT_SCENARIO = "manual"
ROUND_SEQUENCE = 0
DISPOSABLE_CLASS_SLOT = {"day_of_week": 2, "start_period": 3, "end_period": 3, "room": "LOADTEST"}


def fire_concurrently(calls: list[Callable[[], httpx.Response]]) -> list:
    """Release every call in `calls` at the same instant via a barrier."""
    global ROUND_SEQUENCE
    ROUND_SEQUENCE += 1
    if not calls:
        raise RuntimeError("no eligible accounts for concurrent round")
    barrier = threading.Barrier(len(calls))
    results: list = [None] * len(calls)

    def run(i: int, call: Callable[[], httpx.Response]) -> None:
        barrier.wait()
        try:
            results[i] = call()
        except Exception as exc:  # captured for the report, not swallowed
            results[i] = exc

    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        futures = [pool.submit(run, i, call) for i, call in enumerate(calls)]
        wait(futures)
        for future in futures:
            future.result()
    name = f"race-details/{CURRENT_SCENARIO}-batch-{ROUND_SEQUENCE}"
    write_json(name + ".json", {"outcomes": [response_outcome(r) for r in results]})
    if not invariants.check(name + "-invariants.json")["passed"]:
        raise IntegrityFailure(f"race integrity violation captured before cleanup: {name}-invariants.json")
    return results


def get_detail(client: httpx.Client, admin_token: str, class_id: int) -> dict:
    r = client.get(f"{BASE_URL}/api/classes/{class_id}", headers=auth_header(admin_token))
    r.raise_for_status()
    return r.json()["data"]


def schedules_overlap(a: dict, b: dict) -> bool:
    """Mirrors backend/internal/service/registration.go's overlaps()."""
    return a["day_of_week"] == b["day_of_week"] and a["start_period"] <= b["end_period"] and b["start_period"] <= a["end_period"]


def find_clean_students(client: httpx.Client, tokens: dict, candidates: list[str],
                         fixture_slots: list[dict], k: int) -> list[str]:
    """Up to k candidates whose schedule avoids fixture_slots; the seeded demo registrations would otherwise
    cause SCHEDULE_CONFLICT that has nothing to do with the scenario."""
    found = []
    for username in candidates:
        r = client.get(f"{BASE_URL}/api/schedules", headers=auth_header(tokens[username]))
        r.raise_for_status()
        existing = r.json()["data"]["schedules"]
        if not any(schedules_overlap(e, slot) for e in existing for slot in fixture_slots):
            found.append(username)
            if len(found) == k:
                break
    return found


def find_clean_student(client: httpx.Client, tokens: dict, candidates: list[str], fixture_slots: list[dict]) -> str:
    found = find_clean_students(client, tokens, candidates, fixture_slots, 1)
    if not found:
        raise RuntimeError(f"no candidate among {candidates[:10]}... has a schedule free of {fixture_slots}")
    return found[0]


def rotated(seq: list[str], start: int) -> list[str]:
    offset = start % len(seq)
    return seq[offset:] + seq[:offset]


def register_once(client: httpx.Client, token: str, class_id: int) -> httpx.Response:
    return client.post(f"{BASE_URL}/api/registrations", json={"class_ids": [class_id]}, headers=auth_header(token))


def cancel_all(client: httpx.Client, cancellations: list[tuple[str, int]]) -> list[str]:
    """Cancel each (token, registration_id) pair; return error strings for any failure."""
    errors = []
    for token, reg_id in cancellations:
        r = client.delete(f"{BASE_URL}/api/registrations/{reg_id}", headers=auth_header(token))
        if r.status_code != 200:
            errors.append(f"cleanup DELETE /api/registrations/{reg_id} -> {r.status_code} {r.text}")
    return errors


def create_disposable_class(client: httpx.Client, admin_token: str, fixtures: dict, capacity: int, suffix: str) -> dict:
    """A one-off class for scenarios that cancel or lock it."""
    return create_class(client, admin_token, fixtures["course_id"], fixtures["semester_id"],
                         capacity, DISPOSABLE_CLASS_SLOT, suffix)


def b1_class_capacity(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B1: N distinct students racing for the same small-capacity class."""
    class_id = fixtures["small"]["id"]
    capacity = fixtures["small"]["capacity"]
    fixture_slots = [fixtures["small"]["schedule"]]
    admin_token = tokens["admin1"]
    levels = []
    for parallelism in STUDENT_PARALLELISM_LEVELS:
        violations = 0
        errors = []
        for i in range(rounds):
            enrolled = get_detail(client, admin_token, class_id)["enrolled"]
            if enrolled != 0:
                violations += 1
                errors.append(f"round {i}: pre-round enrolled={enrolled}, expected 0 (cleanup left state behind)")
                continue
            target = min(parallelism, len(POOL_USERNAMES))
            chosen = find_clean_students(client, tokens, rotated(POOL_USERNAMES, i * 19), fixture_slots, target)
            if len(chosen) < target:
                violations += 1
                errors.append(f"round {i}: only {len(chosen)}/{target} students have a schedule free of "
                               f"{fixture_slots}; some real seeded registration overlaps it")
            responses = fire_concurrently([(lambda u=u: register_once(client, tokens[u], class_id)) for u in chosen])
            registered, bad = [], []
            for u, r in zip(chosen, responses):
                if isinstance(r, Exception):
                    bad.append(f"{u}: transport error {r!r}")
                elif r.status_code != 200:
                    bad.append(f"{u}: HTTP {r.status_code} {r.text}")
                else:
                    result = r.json()["data"]["results"][0]
                    if result["status"] == "registered":
                        registered.append((tokens[u], result["id"]))
                    elif result.get("code") != Code.CLASS_FULL:
                        bad.append(f"{u}: unexpected code {result.get('code')}")
            actual = get_detail(client, admin_token, class_id)["enrolled"]
            if len(registered) != min(capacity, len(chosen)) or actual != len(registered) or bad:
                violations += 1
                errors.append(f"round {i}: accepted={len(registered)} capacity={capacity} bad={bad[:5]}")
            cleanup = cancel_all(client, registered)
            violations += bool(cleanup)
            errors.extend(cleanup)
        levels.append({"parallelism": parallelism, "rounds": rounds, "violations": violations, "errors": errors[:20]})
    return {"name": "B1 class capacity race", "levels": levels}


def b2_duplicate_registration(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B2: one student sending N identical registration requests at once."""
    class_id = fixtures["cancel_target"]["id"]
    fixture_slots = [fixtures["cancel_target"]["schedule"]]
    levels = []
    for parallelism in SAME_ACCOUNT_PARALLELISM_LEVELS:
        violations = 0
        errors = []
        for i in range(rounds):
            username = find_clean_student(client, tokens, rotated(POOL_USERNAMES, i), fixture_slots)
            token = tokens[username]
            responses = fire_concurrently([(lambda: register_once(client, token, class_id)) for _ in range(parallelism)])
            registered_ids, bad = [], []
            for r in responses:
                if isinstance(r, Exception):
                    bad.append(repr(r))
                elif r.status_code != 200:
                    bad.append(f"HTTP {r.status_code} {r.text}")
                else:
                    result = r.json()["data"]["results"][0]
                    if result["status"] == "registered":
                        registered_ids.append(result["id"])
                    elif result.get("code") != Code.ALREADY_REGISTERED:
                        bad.append(f"unexpected code {result.get('code')}")
            if len(registered_ids) != 1 or bad:
                violations += 1
                errors.append(f"round {i} ({username}): registered={len(registered_ids)} bad={bad[:5]}")
            cleanup = cancel_all(client, [(token, rid) for rid in registered_ids])
            violations += bool(cleanup)
            errors.extend(cleanup)
        levels.append({"parallelism": parallelism, "rounds": rounds, "violations": violations, "errors": errors[:20]})
    return {"name": "B2 duplicate registration race (same account)", "levels": levels}


def b3_credit_limit(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B3: one student racing to exceed the semester credit limit."""
    class_ids = [c["id"] for c in fixtures["credit_sections"]]
    fixture_slots = [c["schedule"] for c in fixtures["credit_sections"]]
    credits_each = fixtures["course_credits"]
    max_credits = fixtures["max_credits"]
    violations = 0
    errors = []
    for i in range(rounds):
        username = find_clean_student(client, tokens, rotated(POOL_USERNAMES, i * 7 + 1), fixture_slots)
        token = tokens[username]
        existing = client.get(f"{BASE_URL}/api/registrations", headers=auth_header(token))
        existing.raise_for_status()
        before_credits = sum(r["credits"] for r in existing.json()["data"]["registrations"])
        responses = fire_concurrently([(lambda cid=cid: register_once(client, token, cid)) for cid in class_ids])
        registered, bad = [], []
        for cid, r in zip(class_ids, responses):
            if isinstance(r, Exception):
                bad.append(repr(r))
            elif r.status_code != 200:
                bad.append(f"HTTP {r.status_code} {r.text}")
            else:
                result = r.json()["data"]["results"][0]
                if result["status"] == "registered":
                    registered.append(result["id"])
                elif result.get("code") not in (Code.CREDIT_LIMIT_EXCEEDED,):
                    bad.append(f"unexpected code {result.get('code')}")
        total = before_credits + len(registered) * credits_each
        if total > max_credits or len(registered) != (max_credits - before_credits) // credits_each or bad:
            violations += 1
            errors.append(f"round {i} ({username}): accepted {len(registered)} sections = {total} credits "
                           f"(limit {max_credits}) bad={bad[:5]}")
        cleanup = cancel_all(client, [(token, rid) for rid in registered])
        violations += bool(cleanup)
        errors.extend(cleanup)
    return {
        "name": "B3 credit limit race", "rounds": rounds, "violations": violations, "errors": errors[:20],
        "note": f"{len(class_ids)} sections x {credits_each} credits, limit {max_credits}",
    }


def b4_schedule_conflict(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B4: one student racing two classes that occupy the same schedule slot."""
    class_ids = [c["id"] for c in fixtures["conflict_pair"]]
    fixture_slots = [c["schedule"] for c in fixtures["conflict_pair"]]
    levels = []
    for parallelism in SAME_ACCOUNT_PARALLELISM_LEVELS:
        violations = 0
        errors = []
        for i in range(rounds):
            username = find_clean_student(client, tokens, rotated(POOL_USERNAMES, i * 11 + 3), fixture_slots)
            token = tokens[username]
            targets = [class_ids[j % 2] for j in range(parallelism)]
            responses = fire_concurrently([(lambda cid=cid: register_once(client, token, cid)) for cid in targets])
            registered, bad = [], []
            for cid, r in zip(targets, responses):
                if isinstance(r, Exception):
                    bad.append(repr(r))
                elif r.status_code != 200:
                    bad.append(f"HTTP {r.status_code} {r.text}")
                else:
                    result = r.json()["data"]["results"][0]
                    if result["status"] == "registered":
                        registered.append(result["id"])
                    elif result.get("code") not in (Code.SCHEDULE_CONFLICT, Code.ALREADY_REGISTERED):
                        bad.append(f"unexpected code {result.get('code')}")
            if len(registered) != 1 or bad:
                violations += 1
                errors.append(f"round {i} ({username}): registered={len(registered)} bad={bad[:5]}")
            cleanup = cancel_all(client, [(token, rid) for rid in registered])
            violations += bool(cleanup)
            errors.extend(cleanup)
        levels.append({"parallelism": parallelism, "rounds": rounds, "violations": violations, "errors": errors[:20]})
    return {"name": "B4 schedule conflict race (same account)", "levels": levels}


def b5_double_cancel(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B5: double-cancel of the same registration id."""
    class_id = fixtures["wide"][0]["id"]
    fixture_slots = [fixtures["wide"][0]["schedule"]]
    admin_token = tokens["admin1"]
    violations = 0
    errors = []
    for i in range(rounds):
        username = find_clean_student(client, tokens, rotated(POOL_USERNAMES, i * 13 + 5), fixture_slots)
        token = tokens[username]
        before = get_detail(client, admin_token, class_id)["enrolled"]
        setup = register_once(client, token, class_id)
        result = setup.json()["data"]["results"][0] if setup.status_code == 200 else None
        if not result or result["status"] != "registered":
            violations += 1
            errors.append(f"round {i} setup failed: {setup.status_code} {setup.text}")
            continue
        reg_id = result["id"]
        responses = fire_concurrently([
            (lambda: client.delete(f"{BASE_URL}/api/registrations/{reg_id}", headers=auth_header(token)))
            for _ in range(2)
        ])
        outcomes = []
        for r in responses:
            if isinstance(r, Exception):
                outcomes.append("transport_error")
            elif r.status_code == 200:
                outcomes.append("200")
            else:
                outcomes.append(fail_code(r) or str(r.status_code))
        after = get_detail(client, admin_token, class_id)["enrolled"]
        if outcomes.count("200") != 1 or outcomes.count(Code.NOT_FOUND) != 1 or after != before:
            violations += 1
            errors.append(f"round {i} ({username}): outcomes={outcomes} enrolled before={before} after={after}")
    return {"name": "B5 double-cancel race", "rounds": rounds, "violations": violations, "errors": errors[:20]}


def b6_admin_cancel_vs_storm(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B6: admin cancels a class while students race to register for it."""
    admin_token = tokens["admin1"]
    parallelism = 20
    rounds = min(rounds, 10)  # creates+cancels a disposable class each round
    violations = 0
    errors = []
    for i in range(rounds):
        cls = create_disposable_class(client, admin_token, fixtures, capacity=parallelism, suffix=f"B6-{i}")
        class_id = cls["id"]
        chosen = find_clean_students(client, tokens, rotated(POOL_USERNAMES, i * 23), [DISPOSABLE_CLASS_SLOT], parallelism)
        calls = [(lambda u=u: register_once(client, tokens[u], class_id)) for u in chosen]
        calls.append(lambda: client.delete(f"{BASE_URL}/api/classes/{class_id}", headers=auth_header(admin_token)))
        responses = fire_concurrently(calls)
        server_errors = [
            (repr(r) if isinstance(r, Exception) else f"HTTP {r.status_code} {r.text}")
            for r in responses
            if isinstance(r, Exception) or r.status_code >= 500
        ]
        for response in responses[:-1]:
            if not isinstance(response, Exception) and response.status_code == 200:
                result = response.json()["data"]["results"][0]
                if result.get("status") != "registered" and result.get("code") != "CLASS_CANCELLED":
                    server_errors.append(f"unexpected registration outcome: {result}")
        detail = get_detail(client, admin_token, class_id)
        inconsistent = detail["status"] != "cancelled" or detail["enrolled"] != 0
        if server_errors or inconsistent:
            violations += 1
            errors.append(f"round {i}: server_errors={server_errors[:5]} "
                           f"final_status={detail['status']} enrolled={detail['enrolled']}")
    return {"name": "B6 admin cancel vs registration storm", "rounds": rounds, "parallelism": parallelism,
            "violations": violations, "errors": errors[:20]}


def b7_admin_update_vs_registration(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B7: admin shrinks capacity / moves the schedule while students register."""
    admin_token = tokens["admin1"]
    rounds = min(rounds, 10)  # creates a disposable class each round
    violations = 0
    errors = []
    for i in range(rounds):
        cls = create_disposable_class(client, admin_token, fixtures, capacity=10, suffix=f"B7-{i}")
        class_id = cls["id"]
        clean_pool = find_clean_students(client, tokens, rotated(POOL_USERNAMES, i * 29), [DISPOSABLE_CLASS_SLOT], 8)
        pre_students, more_students = clean_pool[:3], clean_pool[3:8]
        for u in pre_students:
            r = register_once(client, tokens[u], class_id)
            if r.status_code != 200 or r.json()["data"]["results"][0]["status"] != "registered":
                errors.append(f"round {i} setup failed for {u}: {r.status_code} {r.text}")
        detail = get_detail(client, admin_token, class_id)
        if len(clean_pool) != 8 or detail["enrolled"] != 3:
            violations += 1
            errors.append(f"round {i}: invalid setup: students={len(clean_pool)}, enrolled={detail['enrolled']}")
            continue
        new_schedule = [{"day_of_week": 2, "start_period": 20, "end_period": 20, "room": "LOADTEST-MOVED"}]
        calls = [(lambda u=u: register_once(client, tokens[u], class_id)) for u in more_students]
        calls.append(lambda: client.put(
            f"{BASE_URL}/api/classes/{class_id}",
            json={"class_code": detail["class_code"], "lecturer_name": detail["lecturer_name"],
                  "max_capacity": 2, "schedules": detail["schedules"]},
            headers=auth_header(admin_token),
        ))
        calls.append(lambda: client.put(
            f"{BASE_URL}/api/classes/{class_id}",
            json={"class_code": detail["class_code"], "lecturer_name": detail["lecturer_name"],
                  "max_capacity": detail["max_capacity"], "schedules": new_schedule},
            headers=auth_header(admin_token),
        ))
        responses = fire_concurrently(calls)
        write_json(f"race-details/b7-{i}.json", {"outcomes": [response_outcome(r) for r in responses]})
        schedule_resp = responses[-1]
        bad = [
            (repr(r) if isinstance(r, Exception) else f"HTTP {r.status_code} {r.text}")
            for r in responses
            if isinstance(r, Exception) or r.status_code >= 500
        ]
        schedule_code = None
        if not isinstance(schedule_resp, Exception):
            schedule_code = "200" if schedule_resp.status_code == 200 else fail_code(schedule_resp)
        if schedule_code != Code.SCHEDULE_LOCKED:
            bad.append(f"schedule change expected SCHEDULE_LOCKED (enrolled>0), got {schedule_code}")
        for response in responses[:-2]:
            if not isinstance(response, Exception) and response.status_code == 200:
                result = response.json()["data"]["results"][0]
                if result.get("status") != "registered":
                    bad.append(f"unexpected registration outcome: {result}")
        if isinstance(responses[-2], Exception) or fail_code(responses[-2]) != "CAPACITY_BELOW_ENROLLED":
            bad.append("capacity reduction did not return CAPACITY_BELOW_ENROLLED")
        final = get_detail(client, admin_token, class_id)
        if final["enrolled"] > final["max_capacity"]:
            bad.append(f"enrolled {final['enrolled']} > max_capacity {final['max_capacity']}")
        if bad:
            violations += 1
            errors.append(f"round {i}: {bad[:5]}")
        # Free the shared schedule slot only after the concurrent-round snapshot was saved.
        client.delete(f"{BASE_URL}/api/classes/{class_id}", headers=auth_header(admin_token)).raise_for_status()
    return {"name": "B7 admin update vs registration", "rounds": rounds, "violations": violations, "errors": errors[:20]}


def b8_concurrent_login(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B8: concurrent first logins; exactly one student attempt wins, every admin attempt succeeds."""
    levels = []
    for parallelism in SAME_ACCOUNT_PARALLELISM_LEVELS:
        block = [f"racelogin{uuid.uuid4().hex[:12]}" for _ in range(rounds)]
        add_accounts(block)
        student_violations, student_errors, student_skipped = 0, [], 0
        for i, username in enumerate(block):
            calls = [
                (lambda: client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD}))
                for _ in range(parallelism)
            ]
            responses = fire_concurrently(calls)
            details = [response_outcome(r) for r in responses]
            with psycopg.connect(DATABASE_URL) as conn:
                active = conn.execute("""SELECT count(*) FROM auth_sessions s JOIN users u ON u.id=s.user_id
                    WHERE u.username=%s AND s.logged_out_at IS NULL AND s.expires_at>now()""", (username,)).fetchone()[0]
            write_json(f"race-details/b8-student-{parallelism}-{i}.json",
                       {"username": username, "active_sessions": active, "outcomes": details})
            ok = sum(1 for r in responses if not isinstance(r, Exception) and r.status_code == 200)
            bad = [r for r in responses if isinstance(r, Exception) or r.status_code not in (200, 409)]
            if ok != 1 or active != 1 or bad:
                student_violations += 1
                student_errors.append(f"round {i} ({username}): ok={ok} bad={[str(b) for b in bad][:5]}")

        admin_violations, admin_errors = 0, []
        for i in range(rounds):
            calls = [
                (lambda: client.post(f"{BASE_URL}/api/auth/login", json={"username": "admin2", "password": DEMO_PASSWORD}))
                for _ in range(parallelism)
            ]
            responses = fire_concurrently(calls)
            write_json(f"race-details/b8-admin-{parallelism}-{i}.json", {"outcomes": [response_outcome(r) for r in responses]})
            bad = [r for r in responses if isinstance(r, Exception) or r.status_code != 200]
            if bad:
                admin_violations += 1
                admin_errors.append(f"round {i}: bad={[str(b) for b in bad][:5]}")

        levels.append({
            "parallelism": parallelism,
            "student_rounds": len(block), "student_violations": student_violations,
            "student_skipped": student_skipped, "student_errors": student_errors[:20],
            "admin_rounds": rounds, "admin_violations": admin_violations, "admin_errors": admin_errors[:20],
        })
    return {"name": "B8 concurrent first-time login", "levels": levels,
            "note": "fresh student account for every round; HTTP outcomes and active sessions saved separately"}


def b9_logout_relogin_cooldown(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B9: logout racing an in-flight request, then an immediate relogin attempt."""
    n = rounds
    violations = 0
    errors = []
    for i in range(n):
        username = f"racelogout{uuid.uuid4().hex[:12]}"
        add_accounts([username])
        login_resp = client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
        if login_resp.status_code != 200:
            violations += 1
            errors.append(f"{username}: setup login failed {login_resp.status_code} {login_resp.text}")
            continue
        token = login_resp.json()["data"]["access_token"]
        logout_resp, me_resp = fire_concurrently([
            lambda: client.post(f"{BASE_URL}/api/auth/logout", headers=auth_header(token)),
            lambda: client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(token)),
        ])
        bad = []
        if isinstance(logout_resp, Exception) or logout_resp.status_code != 200:
            bad.append(f"logout -> {logout_resp}")
        if isinstance(me_resp, Exception) or me_resp.status_code not in (200, 401):
            bad.append(f"concurrent /me -> {me_resp}")
        revoked = client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(token))
        if revoked.status_code != 401 or fail_code(revoked) != "SESSION_REVOKED":
            bad.append(f"post-logout /me -> {revoked.status_code} {fail_code(revoked)}")
        relogin = client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
        if relogin.status_code != 429 or fail_code(relogin) != Code.LOGIN_COOLDOWN:
            bad.append(f"immediate relogin expected 429 LOGIN_COOLDOWN, got {relogin.status_code} {relogin.text}")
        elif "Retry-After" not in relogin.headers or "login_allowed_at" not in relogin.json().get("data", {}):
            bad.append(f"LOGIN_COOLDOWN missing Retry-After/login_allowed_at")
        if bad:
            violations += 1
            errors.append(f"round {i} ({username}): {bad}")
    return {"name": "B9 logout mid-flight + immediate relogin cooldown", "rounds": n,
            "violations": violations, "errors": errors[:20]}


def b10_registration_window_closing(client: httpx.Client, tokens: dict, fixtures: dict, rounds: int) -> dict:
    """B10: the registration window closes while students keep registering. Destructive."""
    if not DATABASE_URL:
        return {"name": "B10 registration window closing", "skipped": "DATABASE_URL not set"}

    class_id = fixtures["wide"][1]["id"]
    chosen = find_clean_students(client, tokens, POOL_USERNAMES, [fixtures["wide"][1]["schedule"]], 20)
    window_seconds = 4 if os.environ.get("LOADTEST_QUICK") == "1" else 20
    with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
        original = conn.execute("SELECT registration_closes_at FROM semesters WHERE id=%s", (fixtures["semester_id"],)).fetchone()[0]
        conn.execute(
            "UPDATE semesters SET registration_closes_at = now() + interval '%d seconds' WHERE id = %%s" % window_seconds,
            (fixtures["semester_id"],),
        )
        closes_at = conn.execute(
            "SELECT registration_closes_at FROM semesters WHERE id=%s", (fixtures["semester_id"],)
        ).fetchone()[0]
    print(f"B10: registration closes at {closes_at}; reseed before reusing this database")

    stop_at = time.time() + window_seconds + 10
    accepted_after_deadline = []
    late_responses = []
    counts = Counter()

    def worker(username: str) -> None:
        token = tokens[username]
        while time.time() < stop_at:
            started = time.time()
            r = register_once(client, token, class_id)
            now = time.time()
            counts[f"http_{r.status_code}"] += 1
            if r.status_code == 200:
                result = r.json()["data"]["results"][0]
                if result["status"] == "registered":
                    counts["registered"] += 1
                    if started >= closes_at.timestamp():
                        accepted_after_deadline.append({"username": username, "started": started, "finished": now})
                    if now > closes_at.timestamp():
                        late_responses.append({"started": started, "finished": now, "result": result})
                    client.delete(f"{BASE_URL}/api/registrations/{result['id']}", headers=auth_header(token))
                else:
                    counts[result.get("code", "UNKNOWN")] += 1
            time.sleep(0.05)

    errors = []
    try:
        with ThreadPoolExecutor(max_workers=len(chosen)) as pool:
            for future in [pool.submit(worker, u) for u in chosen]:
                try:
                    future.result()
                except Exception as exc:
                    errors.append(f"{type(exc).__name__}: {exc}")
        integrity = invariants.check("integrity/b10-before-window-restore.json")
    finally:
        with psycopg.connect(DATABASE_URL) as conn:
            conn.execute("UPDATE semesters SET registration_closes_at=%s WHERE id=%s", (original, fixtures["semester_id"]))

    return {
        "name": "B10 registration window closing mid-storm", "window_seconds": window_seconds,
        "violations": int(bool(accepted_after_deadline)),
        "status": "FAIL" if accepted_after_deadline or not integrity["passed"] else
                  "INCONCLUSIVE" if errors or not counts["registered"] or not counts["REGISTRATION_CLOSED"] else "PASS",
        "counts": dict(counts), "worker_errors": errors, "late_responses": late_responses[:100], "integrity": integrity,
        "accepted_after_deadline": accepted_after_deadline[:20],
    }


def b11_token_expiry(client, tokens, fixtures, rounds):
    """B11: real server-side expiry with a short-lived session, without changing clocks."""
    import kaggle_setup
    original = dict(kaggle_setup.API_ENV)
    try:
        kaggle_setup.API_ENV.update(JWT_TTL="5s", SESSION_TTL="5s")
        kaggle_setup.restart_api()
        username = f"raceexpiry{uuid.uuid4().hex[:12]}"
        add_accounts([username])
        response = client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
        response.raise_for_status()
        token = response.json()["data"]["access_token"]
        payload = token.split(".")[1]
        expiry = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["exp"]
        before = client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(token))
        time.sleep(max(0, expiry - time.time()) + 0.1)
        after = [client.get(f"{BASE_URL}/api/auth/me", headers=auth_header(token)) for _ in range(3)]
        return {"name": "B11 natural token expiry", "rounds": 1, "expires_at": expiry,
                "before": response_outcome(before), "after": [response_outcome(r) for r in after],
                "violations": int(before.status_code != 200 or any(r.status_code != 401 for r in after))}
    finally:
        kaggle_setup.API_ENV.clear()
        kaggle_setup.API_ENV.update(original)
        kaggle_setup.restart_api()


SCENARIOS: dict[str, Callable] = {
    "b1": b1_class_capacity,
    "b2": b2_duplicate_registration,
    "b3": b3_credit_limit,
    "b4": b4_schedule_conflict,
    "b5": b5_double_cancel,
    "b6": b6_admin_cancel_vs_storm,
    "b7": b7_admin_update_vs_registration,
    "b8": b8_concurrent_login,
    "b9": b9_logout_relogin_cooldown,
    "b10": b10_registration_window_closing,  # opt-in only, see module docstring
    "b11": b11_token_expiry,
}
DEFAULT_SCENARIOS = [k for k in SCENARIOS if k != "b10"]


def main() -> None:
    global SAME_ACCOUNT_PARALLELISM_LEVELS, STUDENT_PARALLELISM_LEVELS, CURRENT_SCENARIO, ROUND_SEQUENCE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="comma-separated scenario ids, e.g. b1,b4 (default: all but b10)")
    parser.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS)
    parser.add_argument("--levels", default="8,32,128", help="concurrent requests per round")
    args = parser.parse_args()
    SAME_ACCOUNT_PARALLELISM_LEVELS = tuple(int(n) for n in args.levels.split(","))
    STUDENT_PARALLELISM_LEVELS = tuple(sorted({min(n, len(POOL_USERNAMES)) for n in SAME_ACCOUNT_PARALLELISM_LEVELS}))

    selected = args.only.split(",") if args.only else DEFAULT_SCENARIOS
    unknown = [s for s in selected if s not in SCENARIOS]
    if unknown:
        raise SystemExit(f"Unknown scenario id(s): {unknown}; choices are {list(SCENARIOS)}")

    tokens = read_json("tokens.json")
    fixtures = read_json("test_classes.json")
    try:
        reports = read_json("race_report.json")  # keep results of earlier invocations (b10 runs separately)
    except FileNotFoundError:
        reports = {}
    with httpx.Client(timeout=15, limits=httpx.Limits(max_connections=max(SAME_ACCOUNT_PARALLELISM_LEVELS) + 10)) as client:
        for key in selected:
            if key in reports:
                raise SystemExit(f"{key} already has results; use a new notebook run")
            CURRENT_SCENARIO, ROUND_SEQUENCE = key, 0
            print(f"--- running {key} ---")
            try:
                report = SCENARIOS[key](client, tokens, fixtures, args.rounds)
                report["integrity"] = invariants.check(f"integrity/{key}.json")
                if violation_count(report) or not report["integrity"]["passed"]:
                    report["status"] = "FAIL"
                else:
                    report.setdefault("status", "PASS")
            except IntegrityFailure as exc:
                report = {"name": key, "status": "FAIL", "error": str(exc)}
                reports[key] = {**report, "rounds_requested": args.rounds}
                write_json("race_report.json", reports)
                break
            except Exception as exc:
                report = {"name": key, "status": "INCONCLUSIVE", "error": f"{type(exc).__name__}: {exc}"}
            reports[key] = {**report, "rounds_requested": args.rounds}
            print(f"{report['name']}: {violation_count(report)} violation(s)")
            write_json("race_report.json", reports)


if __name__ == "__main__":
    main()
