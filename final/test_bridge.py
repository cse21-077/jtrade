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


BRIDGE_KEY = "test-bridge-key"


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
            patch.object(bridge, "BRIDGE_KEY", BRIDGE_KEY),
            patch.object(bridge, "EA_TOKEN", "test-ea-token"),
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
            db.execute("DELETE FROM prices")
            db.execute("DELETE FROM accounts")

    def provision(self, login="123456", password="secret-pass", server="DerivSVG-Server-02"):
        return self.request("/v1/accounts", "POST", BRIDGE_KEY,
                            {"login": login, "password": password, "server": server})

    def test_auth_required_and_batch_multiplicity_preserved(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "SELL_STOP", "volume": 0.1,
                 "entry_price": 1.075, "tp_enabled": True, "tp_distance": 0.002}
        self.assertEqual(self.request("/v1/orders", "POST", data={"login": "123456", "orders": [order]})[0], 401)
        self.assertEqual(self.request("/v1/orders", "POST", "wrong-key",
                                      {"login": "123456", "orders": [order]},
                                      {"Idempotency-Key": "wrong-key-01"})[0], 401)
        status, body = self.request("/v1/orders", "POST", BRIDGE_KEY,
                                    {"login": "123456", "orders": [order, order]},
                                    {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body)["count"], 2)
        replay_status, replay = self.request("/v1/orders", "POST", BRIDGE_KEY,
                                             {"login": "123456", "orders": [order, order]},
                                             {"Idempotency-Key": "batch-duplicate-01"})
        self.assertEqual(replay_status, 200)
        self.assertTrue(json.loads(replay)["replayed"])
        self.assertEqual(json.loads(replay)["orders"], json.loads(body)["orders"])

    def test_ea_poll_claims_each_order_and_records_result(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        _, created_body = self.request("/v1/orders", "POST", BRIDGE_KEY,
                                       {"login": "123456", "orders": [order]},
                                       {"Idempotency-Key": "single-order-01"})
        order_id = json.loads(created_body)["orders"][0]["id"]
        status, command = self.request("/v1/commands/next?login=123456", token="test-ea-token")
        self.assertEqual(status, 200)
        self.assertEqual(command.decode().split("|")[:3], [order_id, "EURUSD", "BUY_STOP"])
        self.assertEqual(self.request("/v1/commands/next?login=123456", token="test-ea-token")[0], 204)
        status, _ = self.request(f"/v1/commands/{order_id}/result", "POST", "test-ea-token",
                                 {"status": "placed", "ticket": "98765", "message": "Placed"})
        self.assertEqual(status, 200)
        retry_status, retry_body = self.request(
            f"/v1/commands/{order_id}/result", "POST", "test-ea-token",
            {"status": "placed", "ticket": "98765", "message": "Placed"}
        )
        self.assertEqual(retry_status, 200)
        self.assertTrue(json.loads(retry_body)["replayed"])
        lookup_status, lookup_body = self.request(f"/v1/orders/{order_id}", token=BRIDGE_KEY)
        self.assertEqual(lookup_status, 200)
        self.assertEqual(json.loads(lookup_body)["ticket"], "98765")

    def test_ea_rejection_reason_is_returned_to_client(self):
        self.provision()
        order = {"symbol": "EURUSD", "order_type": "MARKET_BUY", "volume": 0.1,
                 "entry_price": 0, "tp_enabled": False, "tp_distance": 0}
        _, created_body = self.request("/v1/orders", "POST", BRIDGE_KEY,
                                       {"login": "123456", "orders": [order]},
                                       {"Idempotency-Key": "rejected-order-01"})
        order_id = json.loads(created_body)["orders"][0]["id"]
        self.assertEqual(self.request("/v1/commands/next?login=123456", token="test-ea-token")[0], 200)
        reason = "Volume must be 0.2 lots or a multiple of 0.2."
        status, _ = self.request(f"/v1/commands/{order_id}/result", "POST", "test-ea-token",
                                 {"status": "rejected", "ticket": "", "message": reason})
        self.assertEqual(status, 200)
        status, body = self.request(f"/v1/orders/{order_id}", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["result_message"], reason)

    def test_orders_are_routed_per_login(self):
        self.provision(login="123456")
        self.provision(login="654321")
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        self.request("/v1/orders", "POST", BRIDGE_KEY,
                     {"login": "123456", "orders": [order]}, {"Idempotency-Key": "route-01"})
        # The other account's EA must not claim this command.
        self.assertEqual(self.request("/v1/commands/next?login=654321", token="test-ea-token")[0], 204)
        self.assertEqual(self.request("/v1/commands/next?login=123456", token="test-ea-token")[0], 200)

    def test_unknown_or_inactive_login_is_rejected(self):
        self.assertEqual(self.request("/v1/commands/next?login=999999", token="test-ea-token")[0], 403)
        order = {"symbol": "EURUSD", "order_type": "BUY_STOP", "volume": 0.1,
                 "entry_price": 1.09, "tp_enabled": False, "tp_distance": 0}
        self.assertEqual(self.request("/v1/orders", "POST", BRIDGE_KEY,
                                      {"login": "999999", "orders": [order]},
                                      {"Idempotency-Key": "unknown-login-01"})[0], 409)
        self.provision(login="555555")
        self.request("/v1/accounts/555555/deactivate", "POST", BRIDGE_KEY)
        self.assertEqual(self.request("/v1/commands/next?login=555555", token="test-ea-token")[0], 403)
        self.assertEqual(self.request("/v1/orders", "POST", BRIDGE_KEY,
                                      {"login": "555555", "orders": [order]},
                                      {"Idempotency-Key": "inactive-login-01"})[0], 409)

    def test_deactivate_stops_terminal_before_marking_account_inactive(self):
        self.provision()
        with bridge.db_session() as db:
            folder_path = db.execute("SELECT folder_path FROM accounts WHERE login='123456'").fetchone()["folder_path"]
        with patch.object(bridge.tm, "stop_account_terminal") as stop_terminal:
            status, body = self.request("/v1/accounts/123456/deactivate", "POST", BRIDGE_KEY)
        self.assertEqual(status, 200)
        stop_terminal.assert_called_once_with(folder_path)
        self.assertTrue(json.loads(body)["terminal_stopped"])
        status, accounts_body = self.request("/v1/accounts", token=BRIDGE_KEY)
        account = json.loads(accounts_body)["accounts"][0]
        self.assertFalse(account["is_active"])

    def test_deactivate_does_not_mark_account_inactive_if_terminal_wont_stop(self):
        self.provision()
        with patch.object(bridge.tm, "stop_account_terminal", side_effect=RuntimeError("still running")):
            status, body = self.request("/v1/accounts/123456/deactivate", "POST", BRIDGE_KEY)
        self.assertEqual(status, 503)
        self.assertIn("still running", json.loads(body)["error"])
        with bridge.db_session() as db:
            account = db.execute("SELECT is_active FROM accounts WHERE login='123456'").fetchone()
        self.assertTrue(account["is_active"])

    def test_polling_does_not_claim_broker_is_connected(self):
        self.provision()
        status, _ = self.request("/v1/commands/next?login=123456", token="test-ea-token")
        self.assertEqual(status, 204)
        status, body = self.request("/v1/status?login=123456", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["terminal_connected"])

    def test_force_refresh_stops_managed_terminals_before_reconcile(self):
        self.provision()
        with patch.object(bridge.tm, "stop_managed_terminals") as stop_managed, \
             patch.object(bridge.tm, "running_logins", return_value=set()), \
             patch.object(bridge.tm, "ensure_terminal", return_value=(True, "launched")) as ensure:
            bridge.reconcile_on_boot(force_refresh=True)
        stop_managed.assert_called_once_with()
        ensure.assert_called_once()

    def test_chart_token_sync_rewrites_utf16_and_utf8_bom_profiles(self):
        token = "replacement-bridge-token"
        with patch.dict(bridge.os.environ, {"JOEMONEY_EA_TOKEN": token}):
            for encoding in ("utf-16", "utf-8-sig"):
                chart = Path(self.temp_dir.name) / f"profile-{encoding}.chr"
                chart.write_text("[Experts]\r\nEaToken=old-token\r\nOther=keep\r\n", encoding=encoding)
                bridge.tm.sync_chart_token(chart)
                text = chart.read_text(encoding=encoding)
                self.assertIn(f"EaToken={token}", text)
                self.assertIn("Other=keep", text)

    def test_explicit_ea_heartbeat_marks_matching_login_connected(self):
        self.provision()
        status, _ = self.request("/v1/terminal/status", "POST", "test-ea-token",
                                 {"login": "123456", "connected": True, "message": "MT5 login successful"})
        self.assertEqual(status, 200)
        status, body = self.request("/v1/status?login=123456", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["terminal_connected"])
        # Heartbeats from unregistered logins are refused.
        self.assertEqual(self.request("/v1/terminal/status", "POST", "test-ea-token",
                                      {"login": "424242", "connected": True})[0], 403)

    def test_ea_heartbeat_reports_live_balance_and_currency(self):
        self.provision()
        status, _ = self.request("/v1/terminal/status", "POST", "test-ea-token",
                                 {"login": "123456", "connected": True, "message": "MT5 login successful",
                                  "balance": 5423.75, "currency": "USD"})
        self.assertEqual(status, 200)
        status, body = self.request("/v1/status?login=123456", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertEqual(payload["balance"], 5423.75)
        self.assertEqual(payload["currency"], "USD")

    def test_provision_registers_account_and_hides_password(self):
        self.fake_running.add("123456")
        status, body = self.provision(password="top-secret")
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertEqual(payload["login"], "123456")
        self.assertTrue(payload["folder_path"])
        self.assertNotIn("top-secret", body.decode())
        status, body = self.request("/v1/accounts", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        account = json.loads(body)["accounts"][0]
        self.assertEqual(account["login"], "123456")
        self.assertEqual(account["server"], "DerivSVG-Server-02")
        self.assertTrue(account["terminal_running"])
        self.assertNotIn("top-secret", body.decode())

    def test_reprovision_updates_credentials_without_duplicate(self):
        self.provision(server="DerivSVG-Server")
        with bridge.db_session() as db:
            folder_path = db.execute("SELECT folder_path FROM accounts WHERE login='123456'").fetchone()["folder_path"]
        with patch.object(bridge.tm, "stop_account_terminal") as stop_terminal:
            self.provision(server="DerivSVG-Server-03")
        stop_terminal.assert_called_once_with(folder_path)
        status, body = self.request("/v1/accounts", token=BRIDGE_KEY)
        accounts = json.loads(body)["accounts"]
        self.assertEqual(len(accounts), 1)
        self.assertEqual(accounts[0]["server"], "DerivSVG-Server-03")

    def test_reprovision_keeps_old_credentials_if_terminal_cannot_stop(self):
        self.provision(server="DerivSVG-Server")
        with patch.object(bridge.tm, "stop_account_terminal", side_effect=RuntimeError("still running")):
            status, body = self.provision(server="DerivSVG-Server-03")
        self.assertEqual(status, 503)
        self.assertIn("still running", json.loads(body)["error"])
        status, body = self.request("/v1/accounts", token=BRIDGE_KEY)
        self.assertEqual(json.loads(body)["accounts"][0]["server"], "DerivSVG-Server")

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

    def test_ea_posts_prices_and_client_reads_them_back(self):
        self.provision()
        ticks = [
            {"symbol": "R_10", "bid": 123.45, "ask": 123.46,
             "volume_min": 0.1, "volume_max": 50, "volume_step": 0.1},
            {"symbol": "1HZ100V", "bid": 1420.5, "ask": 1420.51,
             "volume_min": 0.2, "volume_max": 10, "volume_step": 0.2},
        ]
        status, body = self.request("/v1/prices", "POST", "test-ea-token",
                                    {"login": "123456", "ticks": ticks})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["count"], 2)
        status, body = self.request("/v1/prices", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        payload = json.loads(body)
        self.assertIn("now", payload)
        self.assertEqual(len(payload["prices"]), 2)
        by_symbol = {price["symbol"]: price for price in payload["prices"]}
        self.assertEqual(by_symbol["R_10"]["bid"], 123.45)
        self.assertEqual(by_symbol["R_10"]["ask"], 123.46)
        self.assertEqual(by_symbol["R_10"]["login"], "123456")
        self.assertEqual(by_symbol["R_10"]["volume_min"], 0.1)
        self.assertEqual(by_symbol["R_10"]["volume_step"], 0.1)
        self.assertGreaterEqual(by_symbol["R_10"]["age_sec"], 0)

    def test_full_mt5_names_with_parentheses_do_not_reject_other_ticks(self):
        self.provision()
        ticks = [
            {"symbol": "Volatility 10 (1s) Index", "bid": 5060.39, "ask": 5060.41,
             "volume_min": 0.1, "volume_max": 50, "volume_step": 0.1},
            {"symbol": "XAUUSD", "bid": 2650.10, "ask": 2650.20,
             "volume_min": 0.01, "volume_max": 100, "volume_step": 0.01},
        ]
        status, body = self.request("/v1/prices", "POST", "test-ea-token",
                                    {"login": "123456", "ticks": ticks})
        self.assertEqual(status, 200, body)
        self.assertEqual(json.loads(body)["count"], 2)
        status, body = self.request("/v1/prices?login=123456", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        self.assertEqual({price["symbol"] for price in json.loads(body)["prices"]},
                         {"Volatility 10 (1s) Index", "XAUUSD"})

    def test_prices_reject_unknown_login_and_bad_symbols(self):
        self.provision()
        self.assertEqual(self.request("/v1/prices", "POST", "test-ea-token",
                                      {"login": "424242", "ticks": [{"symbol": "R_10", "bid": 1, "ask": 2}]})[0], 403)
        self.assertEqual(self.request("/v1/prices", "POST", "test-ea-token",
                                      {"login": "123456", "ticks": [{"symbol": "R_10|x", "bid": 1, "ask": 2}]})[0], 400)
        self.assertEqual(self.request("/v1/prices", "POST", "test-ea-token",
                                      {"login": "123456", "ticks": [{"symbol": "R_10", "bid": "x", "ask": 2}]})[0], 400)
        self.assertEqual(self.request("/v1/prices", "POST", "test-ea-token",
                                      {"login": "123456", "ticks": []})[0], 400)

    def test_prices_require_authentication_on_both_endpoints(self):
        self.provision()
        self.assertEqual(self.request("/v1/prices")[0], 401)
        self.assertEqual(self.request("/v1/prices", "POST", None,
                                      {"login": "123456", "ticks": [{"symbol": "R_10", "bid": 1, "ask": 2}]})[0], 401)

    def test_prices_include_stale_ticks_with_age_sec(self):
        self.provision()
        self.request("/v1/prices", "POST", "test-ea-token",
                     {"login": "123456", "ticks": [{"symbol": "R_10", "bid": 1.1, "ask": 1.2}]})
        with bridge.db_session() as db:
            db.execute("UPDATE prices SET updated_at=? WHERE login='123456'", (bridge.time.time() - 90,))
        status, body = self.request("/v1/prices", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        price = json.loads(body)["prices"][0]
        self.assertGreaterEqual(price["age_sec"], 89)
        self.assertLess(price["age_sec"], 95)

    def test_prices_filter_by_login_and_symbols(self):
        self.provision(login="123456")
        self.provision(login="654321")
        self.request("/v1/prices", "POST", "test-ea-token",
                     {"login": "123456", "ticks": [{"symbol": "R_10", "bid": 1, "ask": 2}]})
        self.request("/v1/prices", "POST", "test-ea-token",
                     {"login": "654321", "ticks": [
                         {"symbol": "R_10", "bid": 3, "ask": 4},
                         {"symbol": "R_25", "bid": 5, "ask": 6},
                     ]})
        status, body = self.request("/v1/prices?login=654321", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        symbols = sorted(price["symbol"] for price in json.loads(body)["prices"])
        self.assertEqual(symbols, ["R_10", "R_25"])
        status, body = self.request("/v1/prices?symbols=R_25", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        prices = json.loads(body)["prices"]
        self.assertEqual(len(prices), 1)
        self.assertEqual(prices[0]["symbol"], "R_25")
        self.assertEqual(prices[0]["login"], "654321")
        self.assertEqual(self.request("/v1/prices?symbols=R_10|bad", token=BRIDGE_KEY)[0], 400)

    def test_prices_default_to_active_accounts_only(self):
        self.provision(login="123456")
        self.provision(login="654321")
        self.request("/v1/accounts/654321/deactivate", "POST", BRIDGE_KEY)
        self.request("/v1/prices", "POST", "test-ea-token",
                     {"login": "654321", "ticks": [{"symbol": "R_10", "bid": 1, "ask": 2}]})
        self.request("/v1/prices", "POST", "test-ea-token",
                     {"login": "123456", "ticks": [{"symbol": "R_10", "bid": 3, "ask": 4}]})
        status, body = self.request("/v1/prices", token=BRIDGE_KEY)
        self.assertEqual(status, 200)
        prices = json.loads(body)["prices"]
        self.assertEqual(len(prices), 1)
        self.assertEqual(prices[0]["login"], "123456")

    def test_account_validation(self):
        self.assertEqual(self.request("/v1/accounts", "POST", BRIDGE_KEY,
                                      {"login": "12", "password": "x", "server": "Demo"})[0], 400)
        self.assertEqual(self.request("/v1/accounts", "POST", BRIDGE_KEY,
                                      {"login": "123456", "password": "", "server": "Demo"})[0], 400)
        self.assertEqual(self.request("/v1/accounts", "POST", None,
                                      {"login": "123456", "password": "x", "server": "Demo"})[0], 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
