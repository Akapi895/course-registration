"""Run perf, race, abuse or window. Every case keeps its raw results and a pre-cleanup integrity snapshot."""
import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time
from collections import Counter
from pathlib import Path

import psutil
import psycopg

import invariants
import kaggle_setup
import prepare
from common import BASE_URL, DATABASE_URL, LOAD_STUDENTS, LOAD_USERNAMES, Measurements, RESULTS_DIR, write_json

HERE = Path(__file__).resolve().parent
SERVER_CPUS, GENERATOR_CPUS = kaggle_setup.cpu_plan()
P95_LIMIT_MS = float(os.environ.get("P95_LIMIT_MS", "500"))
ERROR_LIMIT_PCT = float(os.environ.get("ERROR_LIMIT_PCT", "1"))


class Sampler(threading.Thread):
    def __init__(self, directory):
        super().__init__(daemon=True)
        self.directory = directory
        self.done = threading.Event()
        self.samples = []
        self.error = None

    def run(self):
        tracked = {}
        try:
            with psycopg.connect(DATABASE_URL, autocommit=True, connect_timeout=5, options="-c statement_timeout=2000") as conn:
                while not self.done.is_set():
                    for process in psutil.process_iter(["cmdline", "name"]):
                        try:
                            command = " ".join(process.info["cmdline"] or [])
                            label = ("api" if str(kaggle_setup.API_BINARY) in command else
                                     "postgres" if process.info["name"] == "postgres" else
                                     "generator" if "locustfile.py" in command else None)
                            if label and process.pid not in tracked:
                                process.cpu_percent(None)
                                tracked[process.pid] = (label, process)
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                    if self.done.wait(1):
                        break
                    now = time.time()
                    processes = []
                    for pid, (label, process) in list(tracked.items()):
                        try:
                            processes.append({"label": label, "pid": pid, "cpu": process.cpu_percent(None),
                                              "rss_mb": round(process.memory_info().rss / 2**20, 2),
                                              "fds": process.num_fds()})
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            del tracked[pid]
                    db = conn.execute("""SELECT count(*) FILTER (WHERE state='active'),
                        count(*) FILTER (WHERE wait_event_type='Lock'), count(*)
                        FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()""").fetchone()
                    self.samples.append({"timestamp": now, "processes": processes,
                                         "db_active": db[0], "db_lock_waiters": db[1], "db_connections": db[2]})
        except Exception as exc:
            self.error = f"{type(exc).__name__}: {exc}"

    def stop(self):
        self.done.set()
        self.join(timeout=10)
        (self.directory / "resources.json").write_text(json.dumps({"samples": self.samples, "error": self.error}))

    def summary(self, start, end):
        samples = [s for s in self.samples if start <= s["timestamp"] < end]
        cpu = {}
        for label in ("api", "postgres", "generator"):
            values = [sum(p["cpu"] for p in s["processes"] if p["label"] == label) for s in samples]
            cpu[label] = round(sum(values) / len(values), 2) if values else None
        generator = [max((p["cpu"] for p in s["processes"] if p["label"] == "generator"), default=0) for s in samples]
        return {"cpu": cpu, "generator_busy_fraction": sum(v >= 85 for v in generator) / len(generator) if generator else None,
                "api_peak_rss_mb": max((p["rss_mb"] for s in samples for p in s["processes"] if p["label"] == "api"), default=None),
                "db_max_lock_waiters": max((s["db_lock_waiters"] for s in samples), default=None),
                "db_max_connections": max((s["db_connections"] for s in samples), default=None),
                "samples": len(samples), "error": self.error}


def classify(result):
    resources = result["resources"]
    counters = result["counters"]
    reasons = []
    if result.get("api_running") is False:
        return "FAIL", ["API process exited during the case"]
    if not result["requests"]:
        reasons.append("no requests measured")
    if result["mode"] in ("closed", "spike", "burst") and result["unique_accounts_used"] != result["users"]:
        reasons.append("not all requested accounts issued a measured operation")
    if counters.get("dropped") or counters.get("unfinished") or counters.get("worker_errors"):
        reasons.append("generator dropped, failed or did not finish operations")
    if any("too many open files" in error.lower() for error in result["metrics"].get("errors", {})):
        reasons.append("generator file descriptor limit reached")
    if resources["error"] or resources["samples"] < 2:
        reasons.append("resource measurement missing")
    if (resources["generator_busy_fraction"] or 0) > 0.2:
        reasons.append("generator CPU busy in more than 20% of samples")
    if not result["environment_cpu_isolated"]:
        reasons.append("CPU affinity not verified")
    if result["metrics"]["business"].get("INVALID_REGISTRATION_RESPONSE"):
        return "FAIL", ["invalid registration response"]
    if not result["integrity"]["passed"]:
        return "FAIL", ["data integrity violation"]
    if reasons:
        return "INCONCLUSIVE", reasons
    if result["p95"] > P95_LIMIT_MS or result["fail_pct"] > ERROR_LIMIT_PCT:
        return "FAIL", ["latency or HTTP/transport error threshold exceeded"]
    if (result["flows"]["fail_pct"] or 0) > ERROR_LIMIT_PCT:
        return "FAIL", ["business/operation failure threshold exceeded"]
    return "PASS", []


def load_case(name, workload, users, seconds, warmup=15, mode="closed", rate=None, **options):
    directory = RESULTS_DIR / "cases" / name
    directory.mkdir(parents=True, exist_ok=False)
    accounts = options.pop("accounts", LOAD_USERNAMES[:users])
    if workload == "login":
        accounts = [f"admin-client-{i}" for i in range(users)]
    if len(accounts) != users:
        raise ValueError(f"{users} unique accounts requested, only {len(accounts)} available")
    cores = GENERATOR_CPUS.split(",")[:max(1, users)]
    processes, logs = [], []
    sampler = Sampler(directory)
    sampler.start()
    failure = None
    start = None
    try:
        for index, core in enumerate(cores):
            config = {"directory": str(directory), "workload": workload, "accounts": accounts, "worker": index,
                      "workers": len(cores), "warmup": warmup, "seconds": seconds, "mode": mode, "rate": rate, **options}
            path = directory / f"config-{index}.json"
            path.write_text(json.dumps(config))
            log = (directory / f"worker-{index}.log").open("w")
            logs.append(log)
            processes.append(subprocess.Popen(["taskset", "-c", core, sys.executable, str(HERE / "locustfile.py"), str(path)],
                                              stdout=log, stderr=log, start_new_session=True))
        deadline = time.monotonic() + 60
        while len(list(directory.glob("*.ready"))) != len(processes):
            if any(p.poll() is not None for p in processes) or time.monotonic() > deadline:
                raise RuntimeError(f"load workers failed to start: see {directory}")
            time.sleep(0.1)
        start = time.time() + 1
        (directory / "start.json").write_text(json.dumps({"start": start}))
        deadline = time.monotonic() + warmup + seconds + 90
        for process in processes:
            process.wait(timeout=max(1, deadline - time.monotonic()))
            if process.returncode:
                raise RuntimeError(f"load worker exited {process.returncode}: see {directory}")
    except Exception as exc:
        failure = f"{type(exc).__name__}: {exc}"
    finally:
        for process in processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
        for log in logs:
            log.close()
        sampler.stop()
    metrics, flows, counters, used = Measurements(), Measurements(), Counter(), set()
    result = {"name": name, "workload": workload, "mode": mode, "users": users,
              "seconds": seconds, "warmup_seconds": warmup, "offered_operations_per_s": rate,
              "api_running": kaggle_setup.api_pid() is not None}
    try:
        files = list(directory.glob("worker-*.json"))
        if len(files) != len(cores):
            failure = failure or "one or more worker result files are missing"
        for path in files:
            worker = json.loads(path.read_text())
            metrics.merge(worker)
            flows.merge(worker["flows"])
            counters.update(worker["counters"])
            used.update(worker["accounts_used"])
        result.update({**metrics.summary(seconds), "metrics": metrics.data(), "flows": flows.summary(seconds),
                       "counters": dict(counters), "unique_accounts_used": len(used),
                       "resources": sampler.summary((start or 0) + warmup, (start or 0) + warmup + seconds),
                       "environment_cpu_isolated": json.loads((RESULTS_DIR / "environment.json").read_text())["cpu_isolated"]})
        try:
            result["integrity"] = invariants.check(f"cases/{name}/invariants.json")
        except Exception as exc:
            result["integrity_error"] = str(exc)
            failure = failure or "post-load database integrity check unavailable"
        if failure:
            result.update(status="INCONCLUSIVE", error=failure)
            if result.get("integrity", {}).get("passed") is False or not result["api_running"]:
                result["status"] = "FAIL"
        else:
            result["status"], result["reasons"] = classify(result)
    except Exception as exc:
        failure = f"{type(exc).__name__}: {exc}"
        result.update(status="INCONCLUSIVE", error=failure)
    finally:
        write_json(f"cases/{name}/result.json", result)
    if failure:
        raise RuntimeError(failure)
    print(f"{name}: {result['status']} users={users} unique={len(used)} rps={result['rps']} "
          f"p95={result['p95']}ms p99={result['p99']}ms errors={result['fail_pct']}% "
          f"dropped={counters.get('dropped', 0)} business={dict(metrics.business)}", flush=True)
    if not result["integrity"]["passed"]:
        raise RuntimeError("integrity violation preserved; stopping before cleanup")
    prepare.reset_load_registrations()
    return result


def perf(quick):
    measured = 5 if quick else int(os.environ.get("LOADTEST_MEASURE_SECONDS", "60"))
    warmup = 2 if quick else 15
    results = []
    def case(*args, **kwargs):
        result = load_case(*args, **kwargs)
        results.append(result)
        write_json("perf.json", {"p95_limit_ms": P95_LIMIT_MS, "error_limit_pct": ERROR_LIMIT_PCT, "cases": results})
        return result
    case("a1-baseline", "read", 1, measured, warmup)
    levels = [n for n in ((4, LOAD_STUDENTS) if quick else (200, 500, 1000, 2000, 3000, 4000)) if n <= LOAD_STUDENTS]
    if not levels or levels[-1] != LOAD_STUDENTS:
        levels.append(LOAD_STUDENTS)
    for users in sorted(set(levels)):
        case(f"a2-read-{users}", "read", users, measured, warmup, think_time=0 if quick else 1)
    for workload, storm in (("registration", "wide"), ("registration", "small")):
        for users in sorted(set(levels)):
            case(f"a3-{storm}-{users}", workload, users, measured, warmup, storm=storm, think_time=0 if quick else 1)
    # Arrival pacing does not wait for the preceding response. Dropped work invalidates a capacity claim.
    for workload, initial in (("read", 100), ("registration", 25)):
        previous = None
        breaches = 0
        for rate in ([10, 40] if quick else [initial * 2**i for i in range(7)]):
            result = case(f"a4-{workload}-rate-{rate}", workload, LOAD_STUDENTS, measured, warmup, mode="rate", rate=rate)
            if result["status"] == "INCONCLUSIVE":
                break
            breaches = breaches + 1 if result["status"] == "FAIL" else 0
            if result["status"] == "FAIL" and previous and previous["status"] == "PASS" and not quick:
                midpoint = int((previous["offered_operations_per_s"] + rate) / 2)
                refined = case(f"a4-{workload}-refine-{midpoint}", workload, LOAD_STUDENTS, measured, warmup, mode="rate", rate=midpoint)
                lower = midpoint if refined["status"] == "PASS" else previous["offered_operations_per_s"]
                upper = midpoint if refined["status"] == "FAIL" else rate
                for repeat in (2, 3):
                    for boundary in (lower, upper):
                        case(f"a4-{workload}-rate-{boundary}-repeat-{repeat}", workload, LOAD_STUDENTS,
                             measured, warmup, mode="rate", rate=boundary)
            previous = result
            if breaches >= 2:
                break
    peak = min(150 if quick else 4000, LOAD_STUDENTS)
    case("a5-read-spike", "read", peak, 9 if quick else 95, 0, mode="spike", think_time=1,
         base_users=min(2 if quick else 10, peak), rise_seconds=1 if quick else 5, peak_until=5 if quick else 65)
    for window in ([2] if quick else [5, 30]):
        case(f"a5-registration-burst-{peak}-{window}s", "registration", peak, window + 1, 0,
             mode="burst", rate=peak / window, arrival_seconds=window)
    # A recovery observation after high load, not a claim based solely on /health.
    case("a5-recovery", "read", min(10, LOAD_STUDENTS), measured, warmup, think_time=0.2)
    case("a6-soak", "mixed", min(4 if quick else 500, LOAD_STUDENTS), 5 if quick else 600, warmup, think_time=1)
    for users in ([2] if quick else [4, 16, 64]):
        case(f"a7-admin-login-{users}", "login", users, measured, warmup)
        kaggle_setup.restart_api()  # discard bcrypt work whose clients timed out
    # Distinct fresh students: login -> catalog -> batch registration, once each.
    size = min(4 if quick else 4000, LOAD_STUDENTS)
    accounts = [f"loadlogin{i:05d}" for i in range(size)]
    prepare.add_accounts(accounts)
    case(f"a7-student-login-burst-{size}", "student_login", size, 5 if quick else 30, 0,
         accounts=accounts, mode="burst", rate=size / (2 if quick else 5), arrival_seconds=2 if quick else 5)
    kaggle_setup.restart_api()


def race(quick):
    command = [sys.executable, str(HERE / "race_tests.py"), "--rounds", "1" if quick else "20"]
    if quick:
        command += ["--levels", "4,8"]
    subprocess.run(["taskset", "-c", GENERATOR_CPUS, *command], check=True)


def window(quick):
    subprocess.run(["taskset", "-c", GENERATOR_CPUS, sys.executable, str(HERE / "race_tests.py"), "--only", "b10"], check=True)


def abuse(quick):
    if quick:
        raise RuntimeError("abuse is excluded from local rehearsal")
    for scenario in ("c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"):
        kaggle_setup.restart_api()
        directory = RESULTS_DIR / "cases" / scenario
        directory.mkdir(parents=True, exist_ok=False)
        sampler = Sampler(directory)
        sampler.start()
        try:
            subprocess.run(["taskset", "-c", GENERATOR_CPUS, sys.executable, str(HERE / "abuse_tests.py"), "--only", scenario],
                           check=True, timeout=390)
        except (subprocess.SubprocessError, OSError) as exc:
            write_json(f"abuse-{scenario}-runner-error.json", {"error": str(exc)})
            existing = json.loads((RESULTS_DIR / "abuse_report.json").read_text()) if (RESULTS_DIR / "abuse_report.json").exists() else {}
            existing.setdefault(scenario, {})
            existing[scenario].update(status="INCONCLUSIVE", runner_error=str(exc))
            write_json("abuse_report.json", existing)
        finally:
            sampler.stop()
            integrity = invariants.check(f"integrity/abuse-{scenario}.json")
            existing = json.loads((RESULTS_DIR / "abuse_report.json").read_text())
            existing[scenario]["integrity"] = integrity
            existing[scenario]["api_running"] = kaggle_setup.api_pid() is not None
            if not integrity["passed"] or not existing[scenario]["api_running"]:
                existing[scenario]["status"] = "FAIL"
            write_json("abuse_report.json", existing)
            if not integrity["passed"]:
                raise RuntimeError("abuse integrity violation captured; stopping before further mutations")


GROUPS = {"perf": perf, "race": race, "abuse": abuse, "window": window}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("group", choices=GROUPS)
    parser.add_argument("--quick", action="store_true")
    args = parser.parse_args()
    if (RESULTS_DIR / f"group-{args.group}.json").exists():
        raise SystemExit("group already executed; use a new notebook run to preserve earlier evidence")
    os.environ["LOADTEST_SERVER_CPUS"] = SERVER_CPUS
    os.environ["LOADTEST_GENERATOR_CPUS"] = GENERATOR_CPUS
    if hasattr(os, "sched_setaffinity"):
        os.sched_setaffinity(0, {int(c) for c in GENERATOR_CPUS.split(",")})
    state = {"started_at": time.time(), "status": "RUNNING"}
    try:
        prepare.main()
        before = invariants.check(f"integrity/before-{args.group}.json")
        if not before["passed"]:
            raise RuntimeError("database already violates invariants before group")
        GROUPS[args.group](args.quick)
        state["status"] = "COMPLETED"
    except Exception as exc:
        state.update(status="ERROR", error=f"{type(exc).__name__}: {exc}")
        print(state["error"], flush=True)
    finally:
        try:
            state["integrity"] = invariants.check(f"integrity/after-{args.group}.json")
            if not state["integrity"]["passed"] and state["status"] == "COMPLETED":
                state["status"] = "FINDINGS"
        except Exception as exc:
            state["integrity_error"] = str(exc)
        state["finished_at"] = time.time()
        write_json(f"group-{args.group}.json", state)
    # Findings are data, not a reason to skip the later notebook cells.
    print(json.dumps(state, default=str), flush=True)


if __name__ == "__main__":
    main()
