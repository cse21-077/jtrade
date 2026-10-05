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


MENTOR_A = "test-mentor-token-a"
MENTOR_B = "test-mentor-token-b"
EA_TOKEN = "test-ea-token"


class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.db_path = Path(cls.temp_dir.name) / "test.sqlite3"
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.BridgeHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

        cls.fake_running: set[str] = set()
        cls.slot_counter = 0

        def fake_assign_slot(used_folders):
            cls.slot_counter += 1
            slot = Path(cls.temp_dir.name) / f"Slot{cls.slot_counter:03d}"
            slot.mkdir(parents=True, exist_ok=True)
            (slot / "terminal64.exe").write_text("fake")
            return slot

        cls.patches = [
            patch.object(bridge, "DB_PATH", cls.db_path),
            patch.object(bridge, "EA_TOKEN", EA_TOKEN),
            patch.object(bridge, "ALLOWED_ORIGIN", "http://localhost:3000"),
            patch.object(bridge.tm, "assign_slot", fake_assign_slot),
            patch.object(bridge.tm, "ensure_terminal", lambda account: (True, "launched")),
            patch.object(bridge.tm, "running_logins", lambda ttl=10.0: set(cls.fake_running)),
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
            db.execute("DELETE FROM accounts")
            db.execute("DELETE FROM mentors")
            db.execute("DELETE FROM mentor_accounts")
            db.execute("INSERT INTO mentors(token,label,created_at) VALUES(?,?,0)", (MENTOR_A, "a"))
            db.execute("INSERT INTO mentors(token,label,created_at) VALUES(?,?,0)", (MENTOR_B, "b"))

    def provision(self, login="123456", token=MENTOR_A, password="secret-pass", server="DemoBroker"):
        return self.request("/v1/accounts", "POST", token,
                            {"login": login, "password": password, "server": server})

    def test_auth_required_and_batch_multiplicity_preserved(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "SELL_STOP", "volume": 0.1,
                 "entry_price": 1.075, "tp_enabled": True, "tp_distance": 0.002}
        self.assertEqual(self.request("/v1/orders", "POST", data={"login": "123456", "orders": [order]})[0], 401)
        status, body = self.request("/v1/orders", "POST", MENTOR_A,
                                    {"login": "123456", "orders": [order, order]},
                                    {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body)["count"], 2)
        replay_status, replay = self.request("/v1/orders", "POST", MENTOR_A,
                                             {"login": "123456", "orders": [order, order]},
                                             {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(replay_status, 200)
        self.assertTrue(json.loads(replay)["replayed"])
        self.assertEqual(json.loads(replay)["orders"], json.loads(body)["orders"])

    def test_ea_poll_claims_each_order_and_records_result(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        _, created_body = self.request("/v1/orders", "POST", MENTOR_A,
                                       {"login": "123456", "orders": [order]},
                                       {"Idempotency-Key": "single-order-01"})
        order_id = json.loads(created_body)["orders"][0]["id"]
        status, command = self.request("/v1/commands/next?login=123456", token=EA_TOKEN)
        self.assertEqual(status, 200)
        self.assertEqual(command.decode().split("|")[:3], [order_id, "EURUSD", "BUY_STOP"])
        self.assertEqual(self.request("/v1/commands/next?login=123456", token=EA_TOKEN)[0], 204)
        status, _ = self.request(f"/v1/commands/{order_id}/result", "POST", EA_TOKEN,
                                 {"status": "placed", "ticket": "98765", "message": "Placed"})
        self.assertEqual(status, 200)
        lookup_status, lookup_body = self.request(f"/v1/orders/{order_id}", token=MENTOR_A)
        self.assertEqual(lookup_status, 200)
        self.assertEqual(json.loads(lookup_body)["ticket"], "98765")

    def test_orders_are_routed_per_login(self):
        self.provision(login="123456")
        self.provision(login="654321", token=MENTOR_A)
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        self.request("/v1/orders", "POST", MENTOR_A,
                     {"login": "123456", "orders": [order]}, {"Idempotency-Key": "route-01"})
        # The other account's EA must not claim this command.
        self.assertEqual(self.request("/v1/commands/next?login=654321", token=EA_TOKEN)[0], 204)
        self.assertEqual(self.request("/v1/commands/next?login=123456", token=EA_TOKEN)[0], 200)

    def test_unknown_or_inactive_login_is_rejected(self):
        self.assertEqual(self.request("/v1/commands/next?login=999999", token=EA_TOKEN)[0], 403)
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        self.assertEqual(self.request("/v1/orders", "POST", MENTOR_A,
                                      {"login": "999999", "orders": [order]},
                                      {"Idempotency-Key": "unknown-login-01"})[0], 409)
        self.provision(login="555555")
        self.request("/v1/accounts/555555/deactivate", "POST", MENTOR_A)
        self.assertEqual(self.request("/v1/commands/next?login=555555", token=EA_TOKEN)[0], 403)
        self.assertEqual(self.request("/v1/orders", "POST", MENTOR_A,
                                      {"login": "555555", "orders": [order]},
                                      {"Idempotency-Key": "inactive-login-01"})[0], 409)

    def test_polling_does_not_claim_broker_is_connected(self):
        self.provision()
        status, _ = self.request("/v1/commands/next?login=123456", token=EA_TOKEN)
        self.assertEqual(status, 204)
        status, body = self.request("/v1/status?login=123456", token=MENTOR_A)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["terminal_connected"])

    def test_explicit_ea_heartbeat_marks_matching_login_connected(self):
        self.provision()
        status, _ = self.request("/v1/terminal/status", "POST", EA_TOKEN,
                                 {"login": "123456", "connected": True, "message": "MT5 connected"})
        self.assertEqual(status, 200)
        status, body = self.request("/v1/status?login=123456", token=MENTOR_A)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["terminal_connected"])
        # Heartbeats from unregistered logins are refused.
        self.assertEqual(self.request("/v1/terminal/status", "POST", EA_TOKEN,
                                      {"login": "424242", "connected": True})[0], 403)

    def test_provision_registers_account_and_hides_password(self):
        self.fake_running.add("123456")
        status, body = self.provision(password="top-secret")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertEqual(payload["login"], "123456")
        self.assertTrue(payload["folder_path"])
        self.assertNotIn("top-secret", body.decode())
        status, body = self.request("/v1/accounts", token=MENTOR_A)
        self.assertEqual(status, 200)
        account = json.loads(body)["accounts"][0]
        self.assertEqual(account["login"], "123456")
        self.assertEqual(account["server"], "DemoBroker")
        self.assertTrue(account["terminal_running"])
        self.assertNotIn("top-secret", body.decode())

    def test_reprovision_updates_credentials_without_duplicate(self):
        self.provision(server="BrokerOne")
        self.provision(server="BrokerTwo")
        status, body = self.request("/v1/accounts", token=MENTOR_A)
        accounts = json.loads(body)["accounts"]
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]["server"], "BrokerTwo")

    def test_mentor_isolation(self):
        self.provision(login="123456", token=MENTOR_A)
        # Mentor B cannot see mentor A's account.
        status, body = self.request("/v1/accounts", token=MENTOR_B)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["accounts"], [])
        # Mentor B cannot query its status.
        self.assertEqual(self.request("/v1/status?login=123456", token=MENTOR_B)[0], 404)
        # Mentor B cannot send orders to it.
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        self.assertEqual(self.request("/v1/orders", "POST", MENTOR_B,
                                      {"login": "123456", "orders": [order]},
                                      {"Idempotency-Key": "isolation-01"})[0], 409)
        # Mentor B cannot deactivate it.
        self.assertEqual(self.request("/v1/accounts/123456/deactivate", "POST", MENTOR_B)[0], 404)

    def test_order_lookup_is_scoped_to_owner(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        _, created_body = self.request("/v1/orders", "POST", MENTOR_A,
                                       {"login": "123456", "orders": [order]},
                                       {"Idempotency-Key": "scope-01"})
        order_id = json.loads(created_body)["orders"][0]["id"]
        self.assertEqual(self.request(f"/v1/orders/{order_id}", token=MENTOR_B)[0], 404)

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

    def test_account_validation(self):
        self.assertEqual(self.request("/v1/accounts", "POST", MENTOR_A,
                                      {"login": "12", "password": "x", "server": "Demo"})[0], 400)
        self.assertEqual(self.request("/v1/accounts", "POST", MENTOR_A,
                                      {"login": "123456", "password": "", "server": "Demo"})[0], 400)
        self.assertEqual(self.request("/v1/accounts", "POST", None,
                                      {"login": "123456", "password": "x", "server": "Demo"})[0], 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
