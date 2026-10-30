"""Offline smoke checks. HTTP, PostgreSQL and load workers are never started."""
import os
import unittest
from unittest.mock import MagicMock, patch
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://unused/unused")

from common import Measurements, parse_api_response
import invariants
from run_suite import classify


class MeasurementSmoke(unittest.TestCase):
    def test_worker_histograms_are_merged_before_percentiles(self):
        fast, slow, combined = Measurements(), Measurements(), Measurements()
        for _ in range(1000):
            fast.record("GET /api/classes", 1, 200)
        for _ in range(10):
            slow.record("GET /api/classes", 1000, 200)
        combined.merge(fast.data())
        combined.merge(slow.data())
        self.assertEqual(combined.summary(10)["p95"], 1)
        self.assertEqual(combined.summary(10)["requests"], 1010)

    def test_http_200_can_still_be_a_protocol_failure(self):
        measurements = Measurements()
        measurements.record("POST /api/registrations", 5, 200, "INTERNAL_ERROR in results")
        self.assertEqual(measurements.summary(1)["fail_pct"], 100)
        self.assertEqual(measurements.data()["endpoints"]["POST /api/registrations"]["statuses"], {"200": 1})

    def test_locust_transport_response_does_not_need_json_method(self):
        response = SimpleNamespace(status_code=0, error=TimeoutError("deadline"))
        self.assertEqual(parse_api_response(response), (0, {}, "TimeoutError: deadline"))

    def case(self):
        return {"mode": "closed", "users": 4000, "unique_accounts_used": 4000, "requests": 1000,
                "p95": 10, "fail_pct": 0, "flows": {"fail_pct": 0}, "metrics": {"business": {}},
                "resources": {"error": None, "samples": 60, "generator_busy_fraction": 0},
                "counters": {}, "environment_cpu_isolated": True, "integrity": {"passed": True}}

    def test_failed_operations_are_not_a_passing_capacity(self):
        case = self.case()
        case["flows"]["fail_pct"] = 100
        self.assertEqual(classify(case)[0], "FAIL")

    def test_partial_accounts_or_dropped_arrivals_are_inconclusive(self):
        case = self.case()
        case["unique_accounts_used"] = 80
        self.assertEqual(classify(case)[0], "INCONCLUSIVE")
        case = self.case()
        case["counters"]["dropped"] = 1
        self.assertEqual(classify(case)[0], "INCONCLUSIVE")

    def test_integrity_failure_takes_precedence_over_generator_limit(self):
        case = self.case()
        case["integrity"]["passed"] = False
        case["counters"]["dropped"] = 100
        self.assertEqual(classify(case)[0], "FAIL")

    def test_integrity_snapshot_keeps_its_requested_filename(self):
        connection = MagicMock()
        connection.execute.return_value.fetchall.return_value = []
        connection.execute.return_value.fetchone.return_value = {"n": 0}
        with patch.object(invariants.psycopg, "connect") as connect, patch.object(invariants, "write_json") as write:
            connect.return_value.__enter__.return_value = connection
            result = invariants.check("integrity/before-cleanup.json")
        self.assertTrue(result["passed"])
        self.assertEqual(write.call_args.args[0], "integrity/before-cleanup.json")


if __name__ == "__main__":
    unittest.main()
