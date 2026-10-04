import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch

import bridge


class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_dir.name) / "test.sqlite3"
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.BridgeHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"
        cls.patches = [
            patch.object(bridge, "DB_PATH", cls.db_path),
            patch.object(bridge, "CLIENT_TOKEN", "test-client-token"),
            patch.object(bridge, "EA_TOKEN", "test-ea-token"),
            patch.object(bridge, "MT5_LOGIN", "123456"),
            patch.object(bridge, "ALLOWED_ORIGIN", "http://localhost:3000"),
        ]
        for item in cls.patches:
            item.start()

    @classmethod
    def tearDownClass(cls):
        for item in cls.patches:
            item.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp_dir.cleanup()

    def request(self, path, method="GET", token=None, data=None, extra_headers=None):
        body = json.dumps(data).encode() if data is not None else None
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if body:
            headers["Content-Type"] = "application/json"
        headers.update(extra_headers or {})
        req = Request(self.base_url + path, data=body, headers=headers, method=method)
        try:
            with urlopen(req) as response:
                return response.status, response.read()
        except HTTPError as error:
            response = error.read()
            error.close()
            return error.code, response

    def setUp(self):
        with bridge.db_session() as db:
            db.execute("DELETE FROM orders")
            db.execute("DELETE FROM batches")
            db.execute("DELETE FROM terminal_status")

    def test_auth_required_and_batch_multiplicity_preserved(self):
        order = {"symbol": "EURUSD", "order_type": "SELL_STOP", "volume": 0.1,
                 "entry_price": 1.075, "tp_enabled": True, "tp_distance": 0.002}
        self.assertEqual(self.request("/v1/orders", "POST", data={"orders": [order]})[0], 401)
        status, body = self.request("/v1/orders", "POST", "test-client-token", {"orders": [order, order]}, {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body)["count"], 2)
        replay_status, replay = self.request("/v1/orders", "POST", "test-client-token", {"orders": [order, order]}, {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(replay_status, 200)
        self.assertTrue(json.loads(replay)["replayed"])
        self.assertEqual(json.loads(replay)["orders"], json.loads(body)["orders"])

    def test_ea_poll_claims_each_order_and_records_result(self):
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        _, created_body = self.request("/v1/orders", "POST", "test-client-token", {"orders": [order]}, {"Idempotency-Key": "single-order-01"})
        order_id = json.loads(created_body)["orders"][0]["id"]
        status, command = self.request("/v1/commands/next?login=123456", token="test-ea-token")
        self.assertEqual(status, 200)
        self.assertEqual(command.decode().split("|")[:3], [order_id, "EURUSD", "BUY_STOP"])
        self.assertEqual(self.request("/v1/commands/next?login=123456", token="test-ea-token")[0], 204)
        status, _ = self.request(f"/v1/commands/{order_id}/result", "POST", "test-ea-token",
                                 {"status": "placed", "ticket": "98765", "message": "Placed"})
        self.assertEqual(status, 200)
        lookup_status, lookup_body = self.request(f"/v1/orders/{order_id}", token="test-client-token")
        self.assertEqual(lookup_status, 200)
        self.assertEqual(json.loads(lookup_body)["ticket"], "98765")

    def test_polling_does_not_claim_broker_is_connected(self):
        status, _ = self.request("/v1/commands/next?login=123456", token="test-ea-token")
        self.assertEqual(status, 204)
        status, body = self.request("/v1/status", token="test-client-token")
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["terminal_connected"])

    def test_explicit_ea_heartbeat_marks_matching_login_connected(self):
        status, _ = self.request("/v1/terminal/status", "POST", "test-ea-token",
                                 {"login": "123456", "connected": True, "message": "MT5 connected"})
        self.assertEqual(status, 200)
        status, body = self.request("/v1/status", token="test-client-token")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["terminal_connected"])

    def test_account_mismatch_is_rejected(self):
        self.assertEqual(self.request("/v1/commands/next?login=999", token="test-ea-token")[0], 403)

    def test_local_order_console_is_served(self):
        status, body = self.request("/client")
        self.assertEqual(status, 200)
        self.assertIn(b"Demo order console", body)

    def test_tp_requires_positive_distance_and_pending_entry(self):
        with self.assertRaises(ValueError):
            bridge.validate_order({"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                                   "entry_price": 1.09, "tp_enabled": True, "tp_distance": 0})
        with self.assertRaises(ValueError):
            bridge.validate_order({"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                                   "entry_price": 0, "tp_enabled": False, "tp_distance": 0})
        with self.assertRaises(ValueError):
            bridge.validate_order({"symbol": "EURUSD", "order_type": "MARKET_BUY", "volume": float("nan"),
                                   "entry_price": 0, "tp_enabled": False, "tp_distance": 0})


if __name__ == "__main__":
    unittest.main(verbosity=2)