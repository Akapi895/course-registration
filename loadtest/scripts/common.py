"""Settings and helpers shared by every script; the target comes from BASE_URL and DATABASE_URL."""
import json
import math
import os
import time
from collections import Counter
from pathlib import Path
from typing import Any

import httpx

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "DemoUET@123")
RESULTS_DIR = Path(os.environ.get("LOADTEST_RESULTS_DIR", Path(__file__).resolve().parents[1] / "results"))
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

STUDENT_USERNAMES = [f"student{i:03d}" for i in range(1, 101)]
ADMIN_USERNAMES = ["admin1", "admin2"]

# Accounts that must start without a session: B8/B9 race the very first login.
RACE_LOGIN_RESERVED = STUDENT_USERNAMES[-15:]
RACE_LOGOUT_RESERVED = STUDENT_USERNAMES[-20:-15]
POOL_USERNAMES = STUDENT_USERNAMES[:-20]
LOAD_STUDENTS = int(os.environ.get("LOADTEST_STUDENTS", "32" if os.environ.get("LOADTEST_QUICK") == "1" else "4000"))
LOAD_USERNAMES = [f"loadstudent{i:05d}" for i in range(1, LOAD_STUDENTS + 1)]


class Code:
    ALREADY_REGISTERED = "ALREADY_REGISTERED"
    CLASS_FULL = "CLASS_FULL"
    CREDIT_LIMIT_EXCEEDED = "CREDIT_LIMIT_EXCEEDED"
    LOGIN_COOLDOWN = "LOGIN_COOLDOWN"
    NOT_FOUND = "NOT_FOUND"
    SCHEDULE_CONFLICT = "SCHEDULE_CONFLICT"
    SCHEDULE_LOCKED = "SCHEDULE_LOCKED"


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login(client: httpx.Client, username: str) -> httpx.Response:
    return client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})


def fail_code(response: httpx.Response) -> str | None:
    try:
        return response.json()["data"]["code"]
    except (ValueError, KeyError, TypeError):
        return None


def parse_api_response(response):
    """Locust transport ErrorResponse has status 0 and deliberately has no json() method."""
    status = response.status_code or 0
    if not status:
        error = getattr(response, "error", None)
        return 0, {}, f"{type(error).__name__}: {error}"
    try:
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), dict):
            return status, {}, "invalid JSON/envelope"
        error = "invalid success envelope" if 200 <= status < 300 and payload.get("status") != "success" else None
        return status, payload["data"], error
    except (ValueError, TypeError):
        return status, {}, "invalid JSON/envelope"


def violation_count(report: dict) -> int:
    return report.get("violations", 0) + sum(
        level.get("violations", 0) + level.get("student_violations", 0) + level.get("admin_violations", 0)
        for level in report.get("levels", []))


def write_json(name: str, data: Any) -> Path:
    path = RESULTS_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    temporary.replace(path)
    return path


def read_json(name: str) -> Any:
    path = RESULTS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path} not found; run prepare.py first")
    return json.loads(path.read_text(encoding="utf-8"))


def wait_until_healthy(client: httpx.Client, attempts: int = 60) -> None:
    for _ in range(attempts):
        try:
            if client.get(f"{BASE_URL}/health", timeout=3).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError(f"{BASE_URL}/health did not become healthy")


class Measurements:
    """Mergeable millisecond histograms; failures and business outcomes remain separate."""

    def __init__(self):
        self.endpoints = {}
        self.business = Counter()
        self.errors = Counter()

    def record(self, endpoint, milliseconds, status, error=None):
        entry = self.endpoints.setdefault(endpoint, {"requests": 0, "failures": 0, "histogram": {}, "statuses": {}})
        entry["requests"] += 1
        entry["failures"] += int(error is not None or status >= 400 or status == 0)
        bucket = str(math.ceil(milliseconds))
        entry["histogram"][bucket] = entry["histogram"].get(bucket, 0) + 1
        code = str(status)
        entry["statuses"][code] = entry["statuses"].get(code, 0) + 1
        if error:
            self.errors[str(error)[:160]] += 1

    def merge(self, other):
        for name, incoming in other.get("endpoints", {}).items():
            entry = self.endpoints.setdefault(name, {"requests": 0, "failures": 0, "histogram": {}, "statuses": {}})
            for key in ("requests", "failures"):
                entry[key] += incoming[key]
            for key in ("histogram", "statuses"):
                entry[key] = dict(Counter(entry[key]) + Counter(incoming[key]))
        self.business.update(other.get("business", {}))
        self.errors.update(other.get("errors", {}))

    def data(self):
        return {"endpoints": self.endpoints, "business": dict(self.business), "errors": dict(self.errors)}

    def summary(self, seconds):
        histogram = Counter()
        requests = failures = 0
        for entry in self.endpoints.values():
            histogram.update(entry["histogram"])
            requests += entry["requests"]
            failures += entry["failures"]
        return {"requests": requests, "failures": failures, "rps": round(requests / seconds, 2),
                "fail_pct": round(100 * failures / requests, 3) if requests else None,
                **{f"p{p}": histogram_percentile(histogram, p / 100) for p in (50, 95, 99)}}


def histogram_percentile(histogram, fraction):
    count = sum(histogram.values())
    target = math.ceil(count * fraction)
    cumulative = 0
    for bucket, frequency in sorted(histogram.items(), key=lambda item: int(item[0])):
        cumulative += frequency
        if cumulative >= target:
            return int(bucket)
    return None
