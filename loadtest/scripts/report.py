"""Render preserved measurements as text. Findings, failed checks and incomplete cases remain visible."""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

from common import RESULTS_DIR
from kaggle_setup import API_LOG


def load(path):
    path = RESULTS_DIR / path
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def capacity(cases):
    lines = []
    by_workload = defaultdict(lambda: defaultdict(list))
    for case in cases:
        if case.get("mode") == "rate" and "offered_operations_per_s" in case:
            by_workload[case["workload"]][case["offered_operations_per_s"]].append(case)
    for workload, rates in by_workload.items():
        passing = [rate for rate, trials in rates.items() if all(c["status"] == "PASS" for c in trials)]
        lower = max(passing) if passing else None
        failing = [rate for rate, trials in rates.items() if all(c["status"] == "FAIL" for c in trials) and (lower is None or rate > lower)]
        upper = min(failing) if failing else None
        lines.append(f"- {workload}: tốc độ đến lớn nhất quan sát còn đạt = {lower} thao tác/s; "
                     f"mức không đạt phía trên = {upper} thao tác/s.")
        if lower is not None:
            trials = rates[lower]
            throughputs = [c["rps"] for c in trials]
            lines.append(f"  - Tại mức đó: throughput HTTP trung vị {median(throughputs):.2f} req/s "
                         f"(khoảng {min(throughputs):.2f}–{max(throughputs):.2f}); {len(trials)} lần đo.")
        confirmed = lower is not None and upper is not None and len(rates[lower]) >= 3 and len(rates[upper]) >= 3
        lines.append("  - Khoảng đạt/không đạt đã được lặp ít nhất ba lần ở cả hai phía." if confirmed else
                     "  - Chưa xác nhận giới hạn: thiếu lần lặp, bậc không đạt phía trên hoặc năng lực bộ phát tải.")
    return lines


def build():
    lines = ["# Kết quả kiểm thử Phase 1", "", "PASS/FAIL dựa trên ngưỡng bài thử, chưa phải SLA hiệu năng trong SRS.",
             "INCONCLUSIVE: bằng chứng chưa đủ để kết luận năng lực hoặc tính đúng đắn.",
             "FINDING: quan sát cần gia cố, không đồng nghĩa đã gây từ chối dịch vụ thành công."]
    environment = load("environment.json") or {}
    lines += ["", "## Môi trường"]
    for key in ("cores", "cpu_model", "server_cpus", "attacker_cpus", "cpu_isolated", "postgres_version", "python",
                "load_students", "api_config", "commit", "api_sha256"):
        lines.append(f"- {key}: {environment.get(key, 'missing')}")
    lines += ["", "## Trạng thái thực thi"]
    for group in ("perf", "race", "abuse", "window"):
        state = load(f"group-{group}.json")
        lines.append(f"- {group}: {state.get('status', 'INCONCLUSIVE')}" + (f" — {state['error']}" if state.get("error") else "") if state else f"- {group}: CHƯA CHẠY")
    perf = load("perf.json")
    cases = [json.loads(path.read_text()) for path in sorted((RESULTS_DIR / "cases").glob("*/result.json"))]
    if cases:
        lines += ["", "## Hiệu năng", f"Ngưỡng: HTTP p95 ≤ {perf.get('p95_limit_ms', '?') if perf else '?'} ms; "
                  f"lỗi HTTP/kết nối/giao thức và thao tác ≤ {perf.get('error_limit_pct', '?') if perf else '?'}%.",
                  "Percentile được tính từ histogram gộp các worker (làm tròn lên 1 ms).",
                  "Tốc độ đến của bài đăng ký tính theo thao tác; mỗi thao tác có thể tạo nhiều request HTTP.",
                  "", "| case | status | accounts used | req/s | p95 ms | p99 ms | HTTP error % | operation error % | dropped |",
                  "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
        for case in cases:
            if "rps" not in case:
                lines.append(f"| {case['name']} | {case['status']} | — | — | — | — | — | — | — |")
                continue
            lines.append(f"| {case['name']} | {case['status']} | {case['unique_accounts_used']} | {case['rps']} | "
                         f"{case['p95']} | {case['p99']} | {case['fail_pct']} | {case['flows']['fail_pct']} | "
                         f"{case['counters'].get('dropped', 0)} |")
        lines += ["", "### Khoảng giới hạn đo được", *capacity(cases), "", "### Chi tiết theo case"]
        for case in cases:
            lines.append(f"- {case['name']}: {case.get('error') or '; '.join(case.get('reasons', [])) or case['status']}")
            if "metrics" in case:
                lines.append(f"  - business: {case['metrics']['business']}; errors: {case['metrics']['errors']}")
                lines.append(f"  - operation p95/p99: {case['flows']['p95']}/{case['flows']['p99']} ms; counters: {case['counters']}")
                lines.append(f"  - resources: {case['resources']}")
    race = load("race_report.json") or {}
    lines += ["", "## Đồng thời"]
    for key, result in sorted(race.items(), key=lambda item: int(item[0][1:])):
        lines.append(f"- {key}: {result['status']} — {result.get('name')}; requested rounds={result.get('rounds_requested')}")
        lines.append(f"  - {json.dumps(result, ensure_ascii=False, default=str)}")
    lines += ["", "## Chống chịu"]
    for key, result in sorted((load("abuse_report.json") or {}).items()):
        lines.append(f"- {key}: {json.dumps(result, ensure_ascii=False)}")
    for path in sorted(RESULTS_DIR.glob("abuse-*-runner-error.json")):
        lines.append(f"- {path.name}: {path.read_text()}")
    checks = list((RESULTS_DIR / "integrity").glob("*.json")) + list((RESULTS_DIR / "cases").glob("*/invariants.json"))
    checks += list((RESULTS_DIR / "race-details").glob("*-invariants.json"))
    if (RESULTS_DIR / "invariants_report.json").exists():
        checks.append(RESULTS_DIR / "invariants_report.json")
    lines += ["", "## Toàn vẹn dữ liệu", f"Đã lưu {len(checks)} snapshot trước cleanup; không reseed giữa bài."]
    for path in checks:
        result = json.loads(path.read_text())
        if not result["passed"]:
            lines.append(f"- FAIL {path.relative_to(RESULTS_DIR)}: {result['violation_counts']}")
    if checks and all(json.loads(p.read_text())["passed"] for p in checks):
        lines.append("- Mọi snapshot đã lưu đều đạt; cần xem trạng thái nhóm để biết case nào chưa thực thi.")
    if API_LOG.exists():
        text = API_LOG.read_text(errors="replace")
        causes = Counter(line.split("internal error:", 1)[1].strip() for line in text.splitlines() if "internal error:" in line)
        errors = [line for line in text.splitlines() if re.search(r"\|\s+5\d\d\s+\|", line)]
        lines += ["", "## Logs", f"- API: {len(errors)} dòng 5xx; nguyên nhân: {dict(causes)}.",
                  "- api.log được giữ nguyên. Client ngắt kết nối khi hết timeout có thể gây context canceled; cần đối chiếu thời điểm trước khi quy 5xx cho server bão hòa."]
        for path in Path("/var/log/postgresql").glob("*.log"):
            offsets = environment.get("postgres_log_offsets", {})
            with path.open("rb") as source:
                source.seek(offsets.get(str(path), 0))
                content = source.read()
            (RESULTS_DIR / path.name).write_bytes(content)
            lines.append(f"- {path.name}: {content.count(b'deadlock detected')} dòng deadlock sau khi ghi nhận môi trường.")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    report = build()
    (RESULTS_DIR / "report.md").write_text(report, encoding="utf-8")
    print(report)
