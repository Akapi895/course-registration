"""Offline validation only: syntax, notebook code and packaged checksums. No HTTP, DB or load execution."""
import ast
import hashlib
import json
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    scripts = list((root / "scripts").glob("*.py"))
    for path in scripts:
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    notebook = json.loads((root / "loadtest.ipynb").read_text(encoding="utf-8"))
    for index, cell in enumerate(notebook["cells"], 1):
        if cell["cell_type"] == "code":
            ast.parse("".join(cell["source"]), filename=f"notebook-cell-{index}")
            if cell.get("outputs") or cell.get("execution_count") is not None:
                raise ValueError("source notebook must not contain execution output")
    bundle = root / "dist"
    manifest = json.loads((bundle / "MANIFEST.json").read_text())
    if manifest.get("suite_version") != 3:
        raise ValueError("package_dataset.py must run before checking this bundle")
    for name, digest in {"api": manifest["api_sha256"], **manifest["files"]}.items():
        if hashlib.sha256((bundle / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"checksum mismatch: {name}")
        if name.startswith("loadtest/scripts/") and name.endswith(".py"):
            current = root / "scripts" / Path(name).name
            if current.read_bytes() != (bundle / name).read_bytes():
                raise ValueError(f"stale packaged script: {name}")
    print(f"PASS: {len(scripts)} Python files, {len(notebook['cells'])} notebook cells and bundle checksums; no workloads run")


if __name__ == "__main__":
    main()
