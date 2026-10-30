"""Application-layer abuse scenarios: floods, held-open connections, oversized and malformed bodies.

Each scenario reports its own numbers plus how long the API takes to look healthy again. Target
BASE_URL only, and only an instance you started yourself.
"""
import argparse
import json
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait
from contextlib import contextmanager
from urllib.parse import urlsplit

import httpx
import psutil

from collections import Counter
from common import ADMIN_USERNAMES, BASE_URL, DEMO_PASSWORD, LOAD_USERNAMES, auth_header, read_json, wait_until_healthy, write_json

try:
    import resource
    _, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    resource.setrlimit(resource.RLIMIT_NOFILE, (min(hard, 4096), hard))
except (ImportError, ValueError, OSError):
    pass

API_MATCH = "bundle/api"
HOST, PORT = urlsplit(BASE_URL).hostname, urlsplit(BASE_URL).port or 80


def percentile(values: list[float], p: float) -> float | None:
    return sorted(values)[min(len(values) - 1, int(len(values) * p))] if values else None


def api_process() -> psutil.Process | None:
    import kaggle_setup
    pid = kaggle_setup.api_pid()
    return psutil.Process(pid) if pid is not None else None


def footprint() -> dict | None:
    process = api_process()
    if process is None:
        return None
    return {"rss_mb": round(process.memory_info().rss / 2**20, 1), "fds": process.num_fds(),
            "threads": process.num_threads()}


@contextmanager
def rss_peak():
    peak = {"mb": 0.0}
    stop = threading.Event()

    def watch() -> None:
        process = api_process()
        while process is not None and not stop.is_set():
            try:
                peak["mb"] = max(peak["mb"], process.memory_info().rss / 2**20)
            except psutil.NoSuchProcess:
                break
            time.sleep(0.1)

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()
    try:
        yield peak
    finally:
        stop.set()
        thread.join()


def read_latency(client: httpx.Client, token: str, samples: int = 20) -> dict:
    latencies = []
    for _ in range(samples):
        started = time.monotonic()
        response = client.get(f"{BASE_URL}/api/classes", headers=auth_header(token))
        response.raise_for_status()
        latencies.append(time.monotonic() - started)
    return {"p50_s": percentile(latencies, 0.5), "p95_s": percentile(latencies, 0.95)}


def run_workers(count: int, seconds: float, work) -> None:
    stop_at = time.monotonic() + seconds
    with ThreadPoolExecutor(max_workers=count) as pool:
        for future in [pool.submit(work, stop_at) for _ in range(count)]:
            future.result()


def c1_login_flood(client, tokens, seconds):
    """Wrong-password logins pay the bcrypt cost; measure what a legitimate reader sees meanwhile."""
    token = tokens["student001"]
    baseline = read_latency(client, token)
    attempts, victim = [0], []
    statuses, reader_errors = Counter(), Counter()
    lock = threading.Lock()

    def flood(stop_at):
        while time.monotonic() < stop_at:
            try:
                response = client.post(f"{BASE_URL}/api/auth/login", json={"username": "student001", "password": "wrong"}, timeout=10)
                with lock:
                    attempts[0] += 1
                    statuses[str(response.status_code)] += 1
            except httpx.HTTPError as exc:
                with lock:
                    statuses[type(exc).__name__] += 1

    def victim_reads(stop_at):
        while time.monotonic() < stop_at:
            started = time.monotonic()
            try:
                response = client.get(f"{BASE_URL}/api/classes", headers=auth_header(token), timeout=10)
                if response.status_code == 200:
                    victim.append(time.monotonic() - started)
                else:
                    reader_errors[str(response.status_code)] += 1
            except httpx.HTTPError as exc:
                reader_errors[type(exc).__name__] += 1

    stop_at = time.monotonic() + seconds
    with ThreadPoolExecutor(max_workers=21) as pool:
        for future in [pool.submit(flood, stop_at) for _ in range(20)] + [pool.submit(victim_reads, stop_at)]:
            future.result()
    return {"failed_logins_per_s": round(attempts[0] / seconds, 1), "reader_baseline_p95_s": baseline["p95_s"],
            "reader_under_flood_p95_s": percentile(victim, 0.95), "reader_requests": len(victim),
            "login_statuses": dict(statuses), "reader_errors": dict(reader_errors)}


def c2_unauthenticated_flood(client, tokens, seconds):
    """Requests rejected before any database work: the routing/rejection ceiling."""
    counts = Counter()
    lock = threading.Lock()

    def flood(stop_at):
        while time.monotonic() < stop_at:
            try:
                for path in ("/health", "/api/classes", "/api/missing"):
                    response = client.get(f"{BASE_URL}{path}", timeout=10)
                    with lock:
                        counts[f"{path} {response.status_code}"] += 1
            except httpx.HTTPError as exc:
                with lock:
                    counts[type(exc).__name__] += 1

    run_workers(50, seconds, flood)
    return {"requests_per_s": round(sum(counts.values()) / seconds, 1), **counts}


def alive(sock: socket.socket) -> bool:
    try:
        sock.setblocking(False)
        sock.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT)
        return False  # EOF or a response: the server answered or closed
    except BlockingIOError:
        return True
    except OSError:
        return False


def hold_connections(client, count: int, opening: bytes, keepalive: bytes, seconds: float) -> dict:
    sockets = []
    before = footprint()
    try:
        for _ in range(count):
            try:
                sock = socket.create_connection((HOST, PORT), timeout=1)
                sockets.append(sock)
                sock.sendall(opening)
                if len(sockets) % 100 == 0:
                    write_json(f"abuse-details/{'c3' if opening.startswith(b'GET') else 'c4'}-progress.json",
                               {"opened": len(sockets), "phase": "opening", "api": footprint()})
            except OSError:
                break
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            write_json(f"abuse-details/{'c3' if opening.startswith(b'GET') else 'c4'}-progress.json",
                       {"opened": len(sockets), "phase": "holding", "remaining_s": deadline - time.monotonic(), "api": footprint()})
            for sock in sockets:
                try:
                    sock.send(keepalive)
                except OSError:
                    pass
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        open_at_end = sum(alive(sock) for sock in sockets)
        started = time.monotonic()
        try:
            with httpx.Client(timeout=10) as fresh:
                fresh_status = fresh.get(f"{BASE_URL}/health").status_code
        except httpx.HTTPError as exc:
            fresh_status = type(exc).__name__
        return {"requested": count, "opened": len(sockets), "open_after_hold": open_at_end, "hold_s": seconds,
                "fresh_request_status": fresh_status, "fresh_request_s": round(time.monotonic() - started, 3),
                "api_before": before, "api_while_held": footprint()}
    finally:
        for sock in sockets:
            sock.close()


def c3_slowloris(client, tokens, seconds):
    """Headers trickled forever: the request never completes, so only a server timeout can end it."""
    opening = f"GET /health HTTP/1.1\r\nHost: {HOST}\r\n".encode()
    return hold_connections(client, 1000, opening, b"X-Keep: alive\r\n", seconds)


def c4_slow_body(client, tokens, seconds):
    """A declared 1 MB body delivered a byte at a time."""
    opening = (f"POST /api/auth/login HTTP/1.1\r\nHost: {HOST}\r\nContent-Type: application/json\r\n"
               f"Content-Length: 1000000\r\n\r\n").encode()
    return hold_connections(client, 100, opening, b" ", seconds)


def c5_oversized_body(client, tokens, seconds):
    """Login bodies of 10 and 100 MB; the JSON binder reads the whole body into memory."""
    def body(megabytes: int):
        yield b'{"username":"student001","password":"'
        for _ in range(megabytes):
            yield b"x" * 2**20
        yield b'"}'

    results = []
    for megabytes in (10, 100):
        before = footprint()
        started = time.monotonic()
        with rss_peak() as peak:
            try:
                status = client.post(f"{BASE_URL}/api/auth/login", content=body(megabytes), timeout=120,
                                      headers={"Content-Type": "application/json"}).status_code
            except httpx.HTTPError as exc:
                status = type(exc).__name__
        results.append({"body_mb": megabytes, "status": status, "seconds": round(time.monotonic() - started, 1),
                        "rss_before_mb": before and before["rss_mb"], "rss_peak_mb": round(peak["mb"], 1)})
        write_json(f"abuse-details/c5-{megabytes}mb.json", results[-1])
    return {"results": results}


def c6_malformed_payloads(client, tokens, seconds):
    """None of these may produce a 5xx."""
    token = tokens["student001"]
    headers = auth_header(token) | {"Content-Type": "application/json"}
    nested = '{"a":' * 5000 + "1" + "}" * 5000
    cases = {
        "nested_json": lambda: client.post(f"{BASE_URL}/api/registrations", content=nested, headers=headers),
        "duplicate_ids": lambda: client.post(f"{BASE_URL}/api/registrations", json={"class_ids": [1, 1]}, headers=headers),
        "21_ids": lambda: client.post(f"{BASE_URL}/api/registrations", json={"class_ids": list(range(1, 22))}, headers=headers),
        "huge_id": lambda: client.post(f"{BASE_URL}/api/registrations", json={"class_ids": [2**62]}, headers=headers),
        "negative_id": lambda: client.post(f"{BASE_URL}/api/registrations", json={"class_ids": [-1]}, headers=headers),
        "unicode_username": lambda: client.post(f"{BASE_URL}/api/auth/login", json={"username": "🙂" * 500, "password": "x"}),
        "non_numeric_path": lambda: client.get(f"{BASE_URL}/api/classes/abc", headers=headers),
    }
    statuses = {}
    for name, call in cases.items():
        try:
            statuses[name] = call().status_code
        except httpx.HTTPError as exc:
            statuses[name] = type(exc).__name__
    return {"statuses": statuses, "server_errors": sum(isinstance(s, int) and s >= 500 for s in statuses.values())}


def c7_connection_pool_pressure(client, tokens, seconds):
    """200 concurrent readers against a connection pool left at its default size."""
    token_list, latencies = [tokens[u] for u in LOAD_USERNAMES], []
    statuses = Counter()
    lock = threading.Lock()

    def read(stop_at):
        token = token_list[threading.get_ident() % len(token_list)]
        while time.monotonic() < stop_at:
            started = time.monotonic()
            try:
                response = client.get(f"{BASE_URL}/api/classes", headers=auth_header(token), timeout=10)
                with lock:
                    statuses[str(response.status_code)] += 1
                    if response.status_code == 200:
                        latencies.append(time.monotonic() - started)
            except httpx.HTTPError as exc:
                with lock:
                    statuses[type(exc).__name__] += 1

    run_workers(200, seconds, read)
    return {"requests_per_s": round(len(latencies) / seconds, 1), "p50_s": percentile(latencies, 0.5),
            "p95_s": percentile(latencies, 0.95), "p99_s": percentile(latencies, 0.99), "statuses": dict(statuses)}


def c8_brute_force(client, tokens, seconds):
    """Wrong passwords against an admin account, then the right one: is the account ever locked?"""
    username, attempts, statuses = ADMIN_USERNAMES[1], [0], Counter()
    lock = threading.Lock()

    def guess(stop_at):
        while time.monotonic() < stop_at:
            try:
                status = str(client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": "guess"}).status_code)
            except httpx.HTTPError as exc:
                status = type(exc).__name__
            with lock:
                attempts[0] += 1
                statuses[status] += 1

    run_workers(8, seconds, guess)
    final = client.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    return {"attempts": attempts[0], "attempts_per_s": round(attempts[0] / seconds, 1),
            "statuses": dict(statuses), "login_after_attempts_status": final.status_code}


SCENARIOS = {
    "c1": (c1_login_flood, 15), "c2": (c2_unauthenticated_flood, 15), "c3": (c3_slowloris, 60),
    "c4": (c4_slow_body, 30), "c5": (c5_oversized_body, 0), "c6": (c6_malformed_payloads, 0),
    "c7": (c7_connection_pool_pressure, 15), "c8": (c8_brute_force, 20),
}


def recovery(client, token, baseline: dict) -> dict:
    started = time.monotonic()
    consecutive = 0
    after = None
    errors = []
    threshold = max(0.010, baseline["p95_s"] * 3)
    while time.monotonic() - started < 60:
        try:
            client.get(f"{BASE_URL}/health", timeout=3).raise_for_status()
            after = read_latency(client, token, samples=5)
            consecutive = consecutive + 1 if after["p95_s"] <= threshold else 0
            if consecutive >= 3:
                return {"status": "RECOVERED", "recovered_after_s": round(time.monotonic() - started, 2),
                        "read_p95_s": after["p95_s"], "threshold_s": threshold, "api_footprint": footprint()}
        except httpx.HTTPError as exc:
            errors.append(str(exc)[:200])
            consecutive = 0
        time.sleep(1)
    return {"status": "NOT_RECOVERED", "elapsed_s": round(time.monotonic() - started, 2),
            "last_read": after, "errors": errors[:20], "threshold_s": threshold, "api_footprint": footprint()}


def verdict(key, result):
    if result.get("error") or result.get("recovery", {}).get("status") == "ERROR":
        return "INCONCLUSIVE"
    if result.get("recovery", {}).get("status") == "NOT_RECOVERED":
        return "FAIL"
    if key == "c1":
        return "FAIL" if result["reader_errors"] or (result["reader_under_flood_p95_s"] or 0) > 0.5 else "PASS"
    if key == "c2":
        allowed = {"/health 200", "/api/classes 401", "/api/missing 404", "requests_per_s"}
        return "FAIL" if any(k not in allowed and v for k, v in result.items() if k not in ("status", "baseline", "recovery")) else "PASS"
    if key in ("c3", "c4"):
        if result["fresh_request_status"] != 200:
            return "FAIL"
        if not result["opened"]:
            return "INCONCLUSIVE"
        return "FINDING" if result["open_after_hold"] else "PASS"
    if key == "c5":
        if any(not isinstance(item["status"], int) for item in result["results"]):
            return "INCONCLUSIVE"
        return "FINDING" if any(item["status"] != 413 for item in result["results"]) else "PASS"
    if key == "c6":
        return "FAIL" if result["server_errors"] else "INCONCLUSIVE" if any(not isinstance(s, int) for s in result["statuses"].values()) else "PASS"
    if key == "c7":
        if any(s in result["statuses"] for s in ("401", "403")):
            return "INCONCLUSIVE"
        return "FAIL" if any(s != "200" for s in result["statuses"]) else "PASS"
    return "FINDING" if result["statuses"].get("401", 0) and result["login_after_attempts_status"] == 200 else "INCONCLUSIVE"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="comma-separated ids, e.g. c2,c3")
    parser.add_argument("--duration", type=float, help="override every scenario's duration (seconds)")
    args = parser.parse_args()
    selected = args.only.split(",") if args.only else list(SCENARIOS)
    if HOST not in ("127.0.0.1", "localhost", "::1") or urlsplit(BASE_URL).scheme != "http":
        raise SystemExit("abuse scenarios require the notebook's loopback HTTP API")
    if any(key not in SCENARIOS for key in selected):
        raise SystemExit("unknown abuse scenario")

    tokens = read_json("tokens.json")
    token = tokens["student002"]
    try:
        reports = read_json("abuse_report.json")  # one invocation per scenario: keep earlier results
    except FileNotFoundError:
        reports = {}
    with httpx.Client(timeout=15, limits=httpx.Limits(max_connections=400)) as client:
        wait_until_healthy(client)
        for key in selected:
            if key in reports:
                raise SystemExit(f"{key} already has results; use a new notebook run")
            function, default_seconds = SCENARIOS[key]
            print(f"--- {key}: {function.__doc__}", flush=True)
            result = {"status": "RUNNING", "scenario": key}
            reports[key] = result
            write_json("abuse_report.json", reports)
            try:
                baseline = read_latency(client, token)
                result = function(client, tokens, args.duration or default_seconds)
                result.update(status="MEASURED", baseline=baseline)
                reports[key] = result
                write_json("abuse_report.json", reports)
                try:
                    result["recovery"] = recovery(client, token, baseline)
                except Exception as exc:
                    result["recovery"] = {"status": "ERROR", "error": str(exc)}
                result["status"] = verdict(key, result)
            except Exception as exc:
                result = {"status": "INCONCLUSIVE", "error": f"{type(exc).__name__}: {exc}"}
            reports[key] = result
            print(json.dumps(result, ensure_ascii=False), flush=True)
            write_json("abuse_report.json", reports)


if __name__ == "__main__":
    main()
