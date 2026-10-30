"""Build the Kaggle dataset bundle in loadtest/dist: a Linux API binary plus database tooling and loadtest scripts.

    python loadtest/scripts/package_dataset.py [--skip-build]
    cd loadtest/dist && kaggle datasets create -p . --dir-mode zip
    cd loadtest/dist && kaggle datasets version -p . -m "..." --dir-mode zip

Keep --dir-mode zip on both commands: without it Kaggle skips the folders, and a new version replaces the old one.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

LOADTEST = Path(__file__).resolve().parents[1]
REPO = LOADTEST.parent
SCRIPTS = LOADTEST / "scripts"
DEV_ONLY = {"package_dataset.py", "check_bundle.py"}
SKIP_DATABASE = shutil.ignore_patterns("sources", "tests", "docs", "Dockerfile", "__pycache__")


def output(*command: str, cwd: Path = REPO) -> str:
    try:
        return subprocess.check_output(command, cwd=cwd, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def kaggle_username() -> str:
    config = Path.home() / ".kaggle" / "kaggle.json"
    return os.environ.get("KAGGLE_USERNAME") or (json.loads(config.read_text()).get("username", "") if config.exists() else "")


def build_binary(binary: Path) -> None:
    env = {**os.environ, "GOOS": "linux", "GOARCH": "amd64", "CGO_ENABLED": "0"}
    subprocess.run(["go", "build", "-trimpath", "-ldflags=-s -w", "-o", str(binary), "./cmd/api"],
                   cwd=REPO / "backend", env=env, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-build", action="store_true", help="reuse dist/api")
    parser.add_argument("--kaggle-username", default=kaggle_username())
    args = parser.parse_args()

    dist = LOADTEST / "dist"
    dist.mkdir(exist_ok=True)
    binary = dist / "api"
    if not (args.skip_build and binary.exists()):
        build_binary(binary)

    shutil.rmtree(dist / "database", ignore_errors=True)
    shutil.copytree(REPO / "database", dist / "database", ignore=SKIP_DATABASE)
    shutil.rmtree(dist / "loadtest", ignore_errors=True)
    (dist / "loadtest" / "scripts").mkdir(parents=True)
    for script in SCRIPTS.glob("*.py"):
        if script.name not in DEV_ONLY and not script.name.startswith("test_"):
            shutil.copy2(script, dist / "loadtest" / "scripts" / script.name)
    shutil.copy2(LOADTEST / "requirements.txt", dist / "loadtest" / "requirements.txt")

    manifest = {"commit": output("git", "rev-parse", "HEAD"), "go": output("go", "version", cwd=REPO / "backend"),
                "api_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(), "suite_version": 3,
                "working_tree": output("git", "status", "--porcelain"),
                "files": {str(path.relative_to(dist)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest()
                          for folder in (dist / "database", dist / "loadtest") for path in sorted(folder.rglob("*")) if path.is_file()}}
    (dist / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))

    if not args.kaggle_username:
        print("warning: no Kaggle username (~/.kaggle/kaggle.json or --kaggle-username); "
              "dataset-metadata.json needs an id of the form username/slug")
    slug = "course-registration-loadtest"
    metadata = {"title": "course-registration loadtest", "id": f"{args.kaggle_username}/{slug}".lstrip("/"),
                "licenses": [{"name": "CC0-1.0"}]}
    (dist / "dataset-metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"bundle ready: {dist}\nsuite_version: {manifest['suite_version']}\n"
          f"api_sha256: {manifest['api_sha256']}\nchecksummed files: {len(manifest['files'])}")


if __name__ == "__main__":
    main()
