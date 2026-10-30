"""A pinned load worker using Locust's FastHttpUser; run_suite.py supplies its workload and timing."""
from locust import FastHttpUser

import argparse
import json
import math
import random
import time
from collections import Counter
from pathlib import Path

import gevent

from common import BASE_URL, DEMO_PASSWORD, Measurements, auth_header, parse_api_response, read_json


class Client(FastHttpUser):
    host = BASE_URL
    connection_timeout = 3
    network_timeout = 10
    max_retries = 0


def shard(accounts, index, workers):
    return accounts[index::workers]


def run(config):
    from locust.env import Environment
    import resource

    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    resource.setrlimit(resource.RLIMIT_NOFILE, (min(hard, max(soft, 4096)), hard))

    directory = Path(config["directory"])
    worker_id = config["worker"]
    accounts = shard(config["accounts"], worker_id, config["workers"])
    fixtures = read_json("test_classes.json")
    tokens = read_json("tokens.json")
    clients = {}
    measurements = Measurements()
    flows = Measurements()
    counters = Counter()
    busy = set()
    used = set()
    environment = Environment()
    rng = random.Random(20261020 + worker_id)

    (directory / f"worker-{worker_id}.ready").touch()
    control = directory / "start.json"
    while not control.exists():
        gevent.sleep(0.05)
    timing = json.loads(control.read_text())
    begins = timing["start"]
    measured_from = begins + config["warmup"]
    ends = measured_from + config["seconds"]

    def request(username, method, path, payload=None):
        if username not in clients:
            clients[username] = Client(environment).client
        started = time.time()
        response = clients[username].request(method, path, json=payload,
                                            headers=auth_header(tokens[username]) if username in tokens else {})
        elapsed = (time.time() - started) * 1000
        status, data, error = parse_api_response(response)
        if measured_from <= started < ends:
            endpoint = "DELETE /api/registrations/:id" if method == "DELETE" else f"{method} {path}"
            if method == "POST" and path == "/api/registrations" and status == 200:
                results = data.get("results")
                if not isinstance(results, list) or len(results) != len(payload["class_ids"]):
                    measurements.business["INVALID_REGISTRATION_RESPONSE"] += 1
                    error = "invalid registration response"
                else:
                    measurements.business.update(r.get("code", r.get("status", "INVALID_RESULT")) for r in results)
                    if any(r.get("code") == "INTERNAL_ERROR" for r in results):
                        error = "INTERNAL_ERROR in registration results"
            measurements.record(endpoint, elapsed, status, error)
        return status, data

    def operation(username, position):
        started = time.time()
        in_window = measured_from <= started < ends
        if in_window:
            counters["issued"] += 1
            used.add(username)
        flow_ok = True
        try:
            workload = config["workload"]
            if workload in ("login", "student_login"):
                account = username if workload == "student_login" else "admin2"
                status, data = request(username, "POST", "/api/auth/login",
                                       {"username": account, "password": DEMO_PASSWORD})
                if status != 200 or not data.get("access_token"):
                    flow_ok = False
                    return
                tokens[username] = data["access_token"]
                if workload == "login":
                    return
                status, _ = request(username, "GET", "/api/classes")
                flow_ok = status == 200
            if workload == "read" or (workload == "mixed" and rng.random() < 0.8):
                path = rng.choices(["/api/classes", "/api/registrations", "/api/schedules", "/api/auth/me"], [4, 3, 2, 1])[0]
                status, _ = request(username, "GET", path)
                flow_ok = status == 200
            else:
                classes = ([fixtures["small"]] if config.get("storm") == "small" else
                           [band[position % len(band)] for band in fixtures["spread"]])
                status, data = request(username, "POST", "/api/registrations", {"class_ids": [c["id"] for c in classes]})
                results = data.get("results", []) if status == 200 else []
                flow_ok = flow_ok and len(results) == len(classes) and all(
                    r.get("status") == "registered" or
                    (config.get("storm") == "small" and r.get("code") == "CLASS_FULL") for r in results)
                if workload == "student_login":
                    return
                for result in results:
                    if result.get("status") == "registered":
                        status, _ = request(username, "DELETE", f"/api/registrations/{result['id']}")
                        flow_ok = flow_ok and status == 200
        except Exception as exc:
            flow_ok = False
            if in_window:
                counters["worker_errors"] += 1
                measurements.errors[f"worker: {type(exc).__name__}: {exc}"[:160]] += 1
        finally:
            if in_window:
                counters["flow_completed" if flow_ok else "flow_failed"] += 1
                flows.record("operation", (time.time() - started) * 1000, 200 if flow_ok else 500)
            busy.discard(username)

    gevent.sleep(max(0, begins - time.time()))
    pending = set()
    if config["mode"] in ("closed", "spike"):
        def user(username, position):
            cutoff = ends
            if config["mode"] == "spike" and position >= config["base_users"]:
                activation = begins + (position - config["base_users"]) / max(1, len(config["accounts"]) - config["base_users"]) * config["rise_seconds"]
                gevent.sleep(max(0, activation - time.time()))
                cutoff = begins + config["peak_until"]
            while time.time() < cutoff:
                operation(username, position)
                gevent.sleep(config.get("think_time", 0))
        jobs = [gevent.spawn(user, name, position * config["workers"] + worker_id)
                for position, name in enumerate(accounts)]
    else:
        jobs = []
        rate = config["rate"]
        duration = config.get("arrival_seconds", config["warmup"] + config["seconds"])
        total = len(config["accounts"]) if config["mode"] == "burst" else math.ceil(rate * duration)
        sequence = worker_id
        while sequence < total:
            due = begins + sequence / rate
            gevent.sleep(max(0, due - time.time()))
            in_window = measured_from <= due < ends
            lag = time.time() - due
            if in_window:
                counters["scheduled"] += 1
            if config["mode"] == "burst":
                position = sequence
                username = config["accounts"][position]
            else:
                local_position = (sequence // config["workers"]) % len(accounts)
                position = local_position * config["workers"] + worker_id
                username = accounts[local_position]
            if lag > 0.1 or username in busy or time.time() >= ends:
                if in_window:
                    counters["dropped"] += 1
                    counters["scheduler_late"] += int(lag > 0.1)
            else:
                busy.add(username)
                job = gevent.spawn(operation, username, position)
                pending.add(job)
                job.link(lambda completed: pending.discard(completed))
            sequence += config["workers"]
        jobs = list(pending)
    gevent.joinall(jobs, timeout=max(0, ends - time.time()) + 75)
    unfinished = [job for job in jobs if not job.ready()]
    counters["unfinished"] = len(unfinished)
    for job in unfinished:
        job.kill()
    result = {**measurements.data(), "flows": flows.data(), "counters": dict(counters),
              "accounts_used": sorted(used), "timing": {"measured_from": measured_from, "ends": ends}}
    temporary = directory / f"worker-{worker_id}.json.tmp"
    temporary.write_text(json.dumps(result), encoding="utf-8")
    temporary.replace(directory / f"worker-{worker_id}.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config")
    run(json.loads(Path(parser.parse_args().config).read_text()))
