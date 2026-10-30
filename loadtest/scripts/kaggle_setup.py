"""Bring up PostgreSQL 16 and the API inside the Kaggle notebook from the bundle made by package_dataset.py.

    python loadtest/scripts/kaggle_setup.py up | restart-api | reseed | status
"""
import argparse
import hashlib
import json
import os
import platform
import re
import signal
import subprocess
import sys
import time
from zoneinfo import ZoneInfo
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

BUNDLE = Path(os.environ.get("BUNDLE_ROOT", Path(__file__).resolve().parents[2]))
API_BINARY = BUNDLE / "api"
MANAGE = BUNDLE / "database" / "tools" / "manage.py"
RESULTS = Path(os.environ.get("LOADTEST_RESULTS_DIR", BUNDLE / "loadtest" / "results"))
API_PIDFILE = Path("/tmp/loadtest-api.pid")
API_LOG = RESULTS / "api.log"

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://course_app:local_demo_only@127.0.0.1:5432/course_registration")
PORT = os.environ.get("PORT", "8080")
REFERENCE_DATE = os.environ.get("REFERENCE_DATE") or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
RANDOM_SEED = os.environ.get("RANDOM_SEED", "20261020")
JWT_TTL = os.environ.get("JWT_TTL", "4h")
API_ENV = {
    "DATABASE_URL": DATABASE_URL, "PORT": PORT, "GIN_MODE": "release",
    "JWT_SECRET": os.environ.get("JWT_SECRET", "loadtest_only_secret"),
    "JWT_TTL": JWT_TTL, "SESSION_TTL": os.environ.get("SESSION_TTL", JWT_TTL),
    "ADMIN_JWT_TTL": os.environ.get("ADMIN_JWT_TTL", "8h"),
    "LOGIN_COOLDOWN": os.environ.get("LOGIN_COOLDOWN", "20m"),
    "MAX_CREDITS": os.environ.get("MAX_CREDITS", "26"),
}


def run(command: list[str], **kwargs) -> subprocess.CompletedProcess:
    print("$", " ".join(command), flush=True)
    return subprocess.run(command, check=True, **kwargs)


def psql(sql: str, check: bool = True) -> str:
    result = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-tAc", sql],
                             capture_output=True, text=True, check=check)
    return result.stdout.strip()


def cpu_plan() -> tuple[str, str]:
    """Server cores (PostgreSQL + API) and load-generator cores: the lower and upper half of the machine."""
    if os.environ.get("LOADTEST_SERVER_CPUS") and os.environ.get("LOADTEST_GENERATOR_CPUS"):
        return os.environ["LOADTEST_SERVER_CPUS"], os.environ["LOADTEST_GENERATOR_CPUS"]
    cores = sorted(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else list(range(os.cpu_count() or 1))
    half = max(1, len(cores) // 2)
    return ",".join(map(str, cores[:half])), ",".join(map(str, cores[half:] or cores))


def affinity_matches(pid: int, cpus: str) -> bool:
    try:
        return os.sched_getaffinity(pid) == {int(c) for c in cpus.split(",")}
    except (OSError, AttributeError):
        return False


def postgres_pids() -> list[int]:
    out = subprocess.run(["pgrep", "-f", "bin/postgres"], capture_output=True, text=True).stdout
    return [int(pid) for pid in out.split()]


def install() -> None:
    os_release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
    codename = os_release["VERSION_CODENAME"].strip('"')
    run(["apt-get", "update", "-o", "Acquire::Retries=3"])
    run(["apt-get", "install", "-y", "--no-install-recommends", "curl", "ca-certificates", "gnupg", "util-linux", "procps"])
    key = "/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc"
    run(["install", "-d", "/usr/share/postgresql-common/pgdg"])
    run(["curl", "-fsSL", "-o", key, "https://www.postgresql.org/media/keys/ACCC4CF8.asc"])
    Path("/etc/apt/sources.list.d/pgdg.list").write_text(
        f"deb [signed-by={key}] https://apt.postgresql.org/pub/repos/apt {codename}-pgdg main\n")
    run(["apt-get", "update"])
    run(["apt-get", "install", "-y", "--no-install-recommends", "postgresql-16"])
    for requirements in (BUNDLE / "loadtest" / "requirements.txt", BUNDLE / "database" / "requirements.txt"):
        run([sys.executable, "-m", "pip", "install", "-q", "-r", str(requirements)])


def start_postgres() -> None:
    server_cpus, _ = cpu_plan()
    # Started under taskset so postgres and its backends inherit the affinity; re-pinning a running
    # postgres from outside needs CAP_SYS_NICE, which containers usually lack.
    run(["taskset", "-c", server_cpus, "service", "postgresql", "restart"])
    for _ in range(30):
        if subprocess.run(["runuser", "-u", "postgres", "--", "pg_isready"], capture_output=True).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError("PostgreSQL did not become ready")
    version = psql("SHOW server_version")
    print(f"PostgreSQL {version}")
    if not version.startswith("16"):
        raise RuntimeError("expected PostgreSQL 16")


def init_db() -> None:
    parsed = urlparse(DATABASE_URL)
    user, password, database = parsed.username, (parsed.password or "").replace("'", "''"), parsed.path.lstrip("/")
    psql(f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{user}') THEN "
         f"CREATE ROLE {user} LOGIN PASSWORD '{password}'; END IF; END $$;")
    if psql(f"SELECT 1 FROM pg_database WHERE datname='{database}'") != "1":
        run(["runuser", "-u", "postgres", "--", "createdb", "-O", user, database])


def manage(command: str, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": DATABASE_URL, "REFERENCE_DATE": REFERENCE_DATE, "RANDOM_SEED": RANDOM_SEED}
    run([sys.executable, str(MANAGE), command, *args], env=env)


def reseed() -> None:
    if (RESULTS / "tokens.json").exists():
        raise RuntimeError("reseed would invalidate this run's tokens; start a new notebook run instead")
    manage("reset", "--confirm-reset")
    manage("seed")
    manage("verify")


def api_pid() -> int | None:
    try:
        pid = int(API_PIDFILE.read_text())
        os.kill(pid, 0)
        command = Path(f"/proc/{pid}/cmdline").read_bytes().decode().split("\0")
        owned = any(arg == str(API_BINARY) or arg == "/tmp/bundle/api" or
                    (arg.startswith("/tmp/course-registration-loadtest/") and arg.endswith("/bundle/api")) for arg in command)
        if not owned or Path(f"/proc/{pid}/stat").read_text().split()[2] == "Z":
            return None
        return pid
    except (OSError, ValueError):
        return None


def log_tail(chars: int = 4000) -> str:
    return API_LOG.read_text()[-chars:] if API_LOG.exists() else "(no api log yet)"


def start_api() -> None:
    if api_pid() is not None:
        return
    server_cpus, _ = cpu_plan()
    RESULTS.mkdir(parents=True, exist_ok=True)
    with API_LOG.open("a") as log:
        # A new session keeps the API alive when the notebook cell that started it ends.
        process = subprocess.Popen(["taskset", "-c", server_cpus, str(API_BINARY)], env={**os.environ, **API_ENV},
                                    stdout=log, stderr=log, start_new_session=True)
    API_PIDFILE.write_text(str(process.pid))
    for _ in range(60):
        if process.poll() is not None:
            API_PIDFILE.unlink(missing_ok=True)
            raise RuntimeError(f"API exited with {process.returncode}:\n{log_tail()}")
        try:
            with urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3):
                print(f"API healthy (pid {process.pid})")
                return
        except (URLError, OSError):
            time.sleep(1)
    raise RuntimeError(f"API not healthy after 60s:\n{log_tail()}")


def stop_api() -> None:
    pid = api_pid()
    if pid is None:
        return
    os.kill(pid, signal.SIGTERM)
    for _ in range(10):
        if api_pid() is None:
            break
        time.sleep(1)
    else:
        os.kill(pid, signal.SIGKILL)
    API_PIDFILE.unlink(missing_ok=True)


def restart_api() -> None:
    stop_api()
    start_api()


def capture_environment() -> None:
    server_cpus, attacker_cpus = cpu_plan()
    manifest_path = BUNDLE / "MANIFEST.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    cpu_model = next(iter(re.findall(r"model name\s*:\s*(.+)", Path("/proc/cpuinfo").read_text())), "unknown")
    postgres_pinned = bool(postgres_pids()) and all(affinity_matches(pid, server_cpus) for pid in postgres_pids())
    api = api_pid()
    api_pinned = api is not None and affinity_matches(api, server_cpus)
    environment = {
        "cores": os.cpu_count(), "cpu_model": cpu_model, "platform": platform.platform(),
        "server_cpus": server_cpus, "attacker_cpus": attacker_cpus,
        "postgres_pinned": postgres_pinned, "api_pinned": api_pinned,
        "cpu_isolated": server_cpus != attacker_cpus and postgres_pinned and api_pinned,
        "postgres_version": psql("SHOW server_version", check=False), "python": platform.python_version(),
        "commit": manifest.get("commit"), "api_sha256": manifest.get("api_sha256"),
        "reference_date": REFERENCE_DATE, "random_seed": RANDOM_SEED,
        "load_students": int(os.environ.get("LOADTEST_STUDENTS", "32" if os.environ.get("LOADTEST_QUICK") == "1" else "4000")),
        "ram_bytes": os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"),
        "bundle_manifest": manifest,
        "api_process_limits": Path(f"/proc/{api}/limits").read_text() if api else None,
        "postgres_log_offsets": {str(path): path.stat().st_size for path in Path("/var/log/postgresql").glob("*.log")},
        "api_config": {k: v for k, v in API_ENV.items() if k in ("JWT_TTL", "SESSION_TTL", "ADMIN_JWT_TTL", "LOGIN_COOLDOWN", "MAX_CREDITS")},
        "pgx_pool": "library default (backend/internal/repository/db.go sets no MaxConns)",
    }
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "environment.json").write_text(json.dumps(environment, indent=2))
    print(json.dumps(environment, indent=2))


def up() -> None:
    if (RESULTS / "environment.json").exists():
        raise RuntimeError("this result directory already has a run; create a new run directory")
    manifest = json.loads((BUNDLE / "MANIFEST.json").read_text())
    if manifest.get("suite_version") != 3:
        raise RuntimeError("dataset and notebook versions differ; attach the newly packaged dataset")
    expected = {"api": manifest["api_sha256"], **manifest["files"]}
    for name, digest in expected.items():
        if hashlib.sha256((BUNDLE / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"bundle checksum mismatch: {name}")
    stop_api()
    install()
    start_postgres()
    init_db()
    manage("seed")
    manage("verify")
    start_api()
    capture_environment()


def status() -> None:
    print(f"api pid: {api_pid()}")
    try:
        with urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3) as response:
            print(f"GET /health: {response.status}")
    except (URLError, OSError) as exc:
        print(f"GET /health failed: {exc}")
    print(f"--- api log tail ---\n{log_tail(1500)}")


COMMANDS = {"up": up, "restart-api": restart_api, "reseed": reseed, "status": status}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=COMMANDS)
    command = parser.parse_args().command
    if str(BUNDLE).startswith("/kaggle/input"):
        sys.exit(f"{BUNDLE} is read-only; copy the dataset to a writable directory first")
    COMMANDS[command]()


if __name__ == "__main__":
    main()
