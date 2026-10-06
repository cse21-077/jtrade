"""JoeMoney MT5 command bridge. Uses only the Python standard library.

A single static bridge key (JOEMONEY_BRIDGE_KEY) protects every endpoint; the same
key is baked into the private PWA build, so clients never authenticate by hand.
MT5 accounts are registered over HTTPS; the bridge stores credentials in the local
SQLite database, launches portable MT5 terminals with startup.ini auto-login, and
queues orders per account. The JoeMoney EA inside each terminal polls locally,
claims its account's commands, and executes them in MT5.
"""

from __future__ import annotations

import hmac
import hashlib
import json
import math
import os
import re
import sqlite3
import subprocess
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import terminal_manager as tm

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("JOEMONEY_DB_PATH", ROOT / "joemoney.sqlite3"))
BRIDGE_KEY = os.environ.get("JOEMONEY_BRIDGE_KEY", "")
EA_TOKEN = os.environ.get("JOEMONEY_EA_TOKEN", "")
ALLOWED_ORIGIN = os.environ.get("JOEMONEY_ALLOWED_ORIGIN", "http://localhost:3000")
MAX_BATCH_SIZE = 100
MAX_TICK_BATCH_SIZE = 200
ORDER_TYPES = {
    "MARKET_BUY", "MARKET_SELL", "BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"
}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._ ()-]{1,64}$")
LOGIN_RE = re.compile(r"^\d{4,20}$")
HEARTBEAT_STALE_SEC = 30


def connect_db(path: Path | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL,
            symbol TEXT NOT NULL,
            order_type TEXT NOT NULL,
            volume REAL NOT NULL,
            entry_price REAL NOT NULL,
            tp_enabled INTEGER NOT NULL,
            tp_distance REAL NOT NULL,
            status TEXT NOT NULL,
            ticket TEXT,
            result_message TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    order_columns = {row[1] for row in connection.execute("PRAGMA table_info(orders)")}
    if "login" not in order_columns:
        connection.execute("ALTER TABLE orders ADD COLUMN login TEXT NOT NULL DEFAULT ''")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS batches (
            idempotency_key TEXT PRIMARY KEY,
            request_hash TEXT NOT NULL,
            response_json TEXT NOT NULL,
            created_at REAL NOT NULL
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS terminal_status (
            login TEXT PRIMARY KEY,
            connected INTEGER NOT NULL,
            last_seen REAL NOT NULL,
            message TEXT NOT NULL DEFAULT '',
            balance REAL NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT ''
        )"""
    )
    status_columns = {row[1] for row in connection.execute("PRAGMA table_info(terminal_status)")}
    if "balance" not in status_columns:
        connection.execute("ALTER TABLE terminal_status ADD COLUMN balance REAL NOT NULL DEFAULT 0")
    if "currency" not in status_columns:
        connection.execute("ALTER TABLE terminal_status ADD COLUMN currency TEXT NOT NULL DEFAULT ''")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS prices (
            login TEXT NOT NULL,
            symbol TEXT NOT NULL,
            bid REAL NOT NULL,
            ask REAL NOT NULL,
            volume_min REAL NOT NULL DEFAULT 0.01,
            volume_max REAL NOT NULL DEFAULT 100,
            volume_step REAL NOT NULL DEFAULT 0.01,
            volume_limits_known INTEGER NOT NULL DEFAULT 0,
            updated_at REAL NOT NULL,
            PRIMARY KEY(login, symbol)
        )"""
    )
    price_columns = {row[1] for row in connection.execute("PRAGMA table_info(prices)")}
    for name, default in (("volume_min", "0.01"), ("volume_max", "100"), ("volume_step", "0.01"),
                          ("volume_limits_known", "0")):
        if name not in price_columns:
            connection.execute(f"ALTER TABLE prices ADD COLUMN {name} REAL NOT NULL DEFAULT {default}")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS accounts (
            login TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            server TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    return connection


@contextmanager
def db_session():
    connection = connect_db()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def auth_matches(header: str, expected: str) -> bool:
    if not expected or not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[7:], expected)


def client_authed(header: str) -> bool:
    return auth_matches(header, BRIDGE_KEY)


def ea_authed(header: str) -> bool:
    return auth_matches(header, BRIDGE_KEY) or auth_matches(header, EA_TOKEN)


def validate_account(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Account must be an object.")
    login = str(payload.get("login", "")).strip()
    password = str(payload.get("password", ""))
    server = str(payload.get("server", "")).strip()
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    if not 1 <= len(password) <= 128:
        raise ValueError("password must be 1-128 characters.")
    if not 1 <= len(server) <= 128:
        raise ValueError("server must be 1-128 characters.")
    return {"login": login, "password": password, "server": server}


def validate_order(item: object) -> dict:
    if not isinstance(item, dict):
        raise ValueError("Each order must be an object.")
    symbol = item.get("symbol")
    order_type = item.get("order_type")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
        raise ValueError("Symbol must contain 1-64 letters, digits, spaces, dots, underscores, parentheses, or hyphens.")
    if order_type not in ORDER_TYPES:
        raise ValueError("Unsupported order_type.")
    try:
        volume = float(item.get("volume"))
        entry_price = float(item.get("entry_price", 0))
        tp_distance = float(item.get("tp_distance", 0))
    except (TypeError, ValueError):
        raise ValueError("volume, entry_price, and tp_distance must be numbers.") from None
    if not all(math.isfinite(value) for value in (volume, entry_price, tp_distance)):
        raise ValueError("volume, entry_price, and tp_distance must be finite numbers.")
    if not 0 < volume <= 100:
        raise ValueError("volume must be greater than 0 and no more than 100 lots.")
    market = order_type.startswith("MARKET_")
    if not market and entry_price <= 0:
        raise ValueError("Pending orders require entry_price greater than zero.")
    if market and entry_price != 0:
        raise ValueError("Market orders must use entry_price 0.")
    tp_enabled = item.get("tp_enabled", False)
    if not isinstance(tp_enabled, bool):
        raise ValueError("tp_enabled must be a boolean.")
    if tp_distance < 0 or (tp_enabled and tp_distance <= 0):
        raise ValueError("Enabled TP requires tp_distance greater than zero.")
    return {
        "symbol": symbol,
        "order_type": order_type,
        "volume": volume,
        "entry_price": entry_price,
        "tp_enabled": tp_enabled,
        "tp_distance": tp_distance,
    }


def validate_ticks(payload: object) -> tuple[str, list[dict]]:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be an object.")
    login = str(payload.get("login", "")).strip()
    if not LOGIN_RE.fullmatch(login):
        raise ValueError("login must be 4-20 digits.")
    ticks = payload.get("ticks")
    if not isinstance(ticks, list) or not 1 <= len(ticks) <= MAX_TICK_BATCH_SIZE:
        raise ValueError(f"ticks must contain 1-{MAX_TICK_BATCH_SIZE} ticks.")
    validated = []
    for tick in ticks:
        if not isinstance(tick, dict):
            raise ValueError("Each tick must be an object.")
        symbol = tick.get("symbol")
        if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
            raise ValueError("Symbol must contain 1-64 letters, digits, spaces, dots, underscores, parentheses, or hyphens.")
        has_volume_limits = all(name in tick for name in ("volume_min", "volume_max", "volume_step"))
        try:
            bid = float(tick.get("bid"))
            ask = float(tick.get("ask"))
            volume_min = float(tick.get("volume_min", 0.01))
            volume_max = float(tick.get("volume_max", 100))
            volume_step = float(tick.get("volume_step", 0.01))
        except (TypeError, ValueError):
            raise ValueError("bid, ask, and volume limits must be numbers.") from None
        if not all(math.isfinite(value) for value in (bid, ask, volume_min, volume_max, volume_step)):
            raise ValueError("bid, ask, and volume limits must be finite numbers.")
        if bid <= 0 or ask <= 0 or volume_min <= 0 or volume_max < volume_min or volume_step <= 0:
            raise ValueError("bid/ask and volume limits must be positive and consistent.")
        validated.append({"symbol": symbol, "bid": bid, "ask": ask,
                          "volume_min": volume_min, "volume_max": volume_max, "volume_step": volume_step,
                          "volume_limits_known": has_volume_limits})
    return login, validated


def reconcile_on_boot(force_refresh: bool = False) -> None:
    """Launch active accounts, optionally closing and refreshing managed terminals first."""
    if force_refresh:
        print("[reconcile] closing managed MT5 terminals before refreshing EA/profile files")
        tm.stop_managed_terminals()
    running = tm.running_logins(ttl=0)
    with db_session() as db:
        rows = db.execute("SELECT * FROM accounts WHERE is_active=1").fetchall()
    for row in rows:
        if row["login"] in running:
            print(f"[reconcile] {row['login']} already running")
            continue
        ok, message = tm.ensure_terminal(dict(row))
        state = "OK" if ok else "FAILED"
        print(f"[reconcile] {row['login']} -> {state}: {message}")


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "JoeMoneyBridge/2.1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _send(self, status: int, payload: object = None, content_type: str = "application/json") -> None:
        if payload is None:
            body = b""
        elif content_type == "text/plain; charset=utf-8":
            body = str(payload).encode("utf-8")
        else:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin and origin == ALLOWED_ORIGIN:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _read_json(self) -> object:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 1 or length > 256_000:
            raise ValueError("Request body must be between 1 byte and 256 KB.")
        return json.loads(self.rfile.read(length))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/client":
            body = (ROOT / "client.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/health":
            return self._send(200, {"status": "ok", "service": "JoeMoney MT5 bridge"})
        if parsed.path == "/v1/status":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            now = time.time()
            with db_session() as db:
                if login:
                    row = db.execute(
                        "SELECT connected,last_seen,message,balance,currency FROM terminal_status WHERE login=?", (login,)
                    ).fetchone()
                    return self._send(200, {
                        "login": login,
                        "terminal_connected": bool(row and row["connected"] and now - row["last_seen"] < HEARTBEAT_STALE_SEC),
                        "last_seen": row["last_seen"] if row else None,
                        "message": row["message"] if row else "Waiting for the JoeMoney EA heartbeat.",
                        "balance": float(row["balance"]) if row else 0.0,
                        "currency": row["currency"] if row else "",
                    })
                count = db.execute("SELECT COUNT(*) AS c FROM accounts WHERE is_active=1").fetchone()["c"]
            return self._send(200, {"status": "ok", "service": "JoeMoney MT5 bridge", "active_accounts": count})
        if parsed.path == "/v1/accounts":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            running = tm.running_logins()
            now = time.time()
            with db_session() as db:
                rows = db.execute("SELECT * FROM accounts ORDER BY created_at").fetchall()
                accounts = []
                for row in rows:
                    heartbeat = db.execute(
                        "SELECT connected,last_seen,message FROM terminal_status WHERE login=?", (row["login"],)
                    ).fetchone()
                    accounts.append({
                        "login": row["login"],
                        "server": row["server"],
                        "folder_path": row["folder_path"],
                        "is_active": bool(row["is_active"]),
                        "terminal_running": row["login"] in running,
                        "ea_connected": bool(
                            heartbeat and heartbeat["connected"] and now - heartbeat["last_seen"] < HEARTBEAT_STALE_SEC
                        ),
                        "last_seen": heartbeat["last_seen"] if heartbeat else None,
                        "message": heartbeat["message"] if heartbeat else "Waiting for the JoeMoney EA heartbeat.",
                    })
            return self._send(200, {"accounts": accounts})
        if parsed.path == "/v1/prices":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            params = parse_qs(parsed.query)
            login = params.get("login", [""])[0].strip()
            symbols_param = params.get("symbols", [""])[0]
            clauses = []
            arguments: list = []
            if login:
                if not LOGIN_RE.fullmatch(login):
                    return self._send(400, {"error": "login must be 4-20 digits."})
                clauses.append("login=?")
                arguments.append(login)
            else:
                clauses.append("login IN (SELECT login FROM accounts WHERE is_active=1)")
            if symbols_param.strip():
                symbols = [symbol.strip() for symbol in symbols_param.split(",") if symbol.strip()]
                if not symbols or any(not SYMBOL_RE.fullmatch(symbol) or "|" in symbol for symbol in symbols):
                    return self._send(400, {"error": "Invalid symbols filter."})
                clauses.append("symbol IN (%s)" % ",".join("?" * len(symbols)))
                arguments.extend(symbols)
            now = time.time()
            with db_session() as db:
                rows = db.execute(
                    "SELECT login,symbol,bid,ask,volume_min,volume_max,volume_step,volume_limits_known,updated_at FROM prices WHERE " + " AND ".join(clauses),
                    arguments,
                ).fetchall()
            prices = [
                {
                    "login": row["login"],
                    "symbol": row["symbol"],
                    "bid": row["bid"],
                    "ask": row["ask"],
                    "volume_min": row["volume_min"],
                    "volume_max": row["volume_max"],
                    "volume_step": row["volume_step"],
                    "volume_limits_known": bool(row["volume_limits_known"]),
                    "age_sec": round(now - row["updated_at"], 1),
                }
                for row in rows
            ]
            return self._send(200, {"prices": prices, "now": now})
        match = re.fullmatch(r"/v1/orders/([0-9a-f-]+)", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                row = db.execute(
                    "SELECT id,status,ticket,result_message,created_at,updated_at FROM orders WHERE id=?",
                    (match.group(1),),
                ).fetchone()
            if not row:
                return self._send(404, {"error": "Unknown order."})
            return self._send(200, dict(row))
        if parsed.path == "/v1/commands/next":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0].strip()
            now = time.time()
            with db_session() as db:
                account = db.execute("SELECT is_active FROM accounts WHERE login=?", (login,)).fetchone()
                if not account:
                    return self._send(403, {"error": "EA login is not a registered JoeMoney account."})
                if not account["is_active"]:
                    return self._send(403, {"error": "MT5 account is deactivated."})
                db.execute("BEGIN IMMEDIATE")
                row = db.execute(
                    "SELECT * FROM orders WHERE status='queued' AND login=? ORDER BY created_at LIMIT 1", (login,)
                ).fetchone()
                if not row:
                    db.commit()
                    return self._send(204)
                db.execute("UPDATE orders SET status='claimed',updated_at=? WHERE id=? AND status='queued'", (now, row["id"]))
                db.commit()
            fields = [
                row["id"], row["symbol"], row["order_type"], f'{row["volume"]:.8f}',
                f'{row["entry_price"]:.10f}', "1" if row["tp_enabled"] else "0",
                f'{row["tp_distance"]:.10f}',
            ]
            return self._send(200, "|".join(fields), "text/plain; charset=utf-8")
        return self._send(404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/v1/accounts":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                account = validate_account(self._read_json())
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            now = time.time()
            with db_session() as db:
                existing = db.execute("SELECT * FROM accounts WHERE login=?", (account["login"],)).fetchone()
            if existing:
                credentials_changed = (
                    existing["password"] != account["password"] or existing["server"] != account["server"]
                )
                must_restart = credentials_changed or not existing["is_active"]
                if must_restart:
                    try:
                        tm.stop_account_terminal(existing["folder_path"])
                    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                        return self._send(503, {"error": f"Could not stop the previous MT5 terminal before updating credentials: {error}"})
                folder_path = existing["folder_path"]
                with db_session() as db:
                    db.execute(
                        "UPDATE accounts SET password=?,server=?,is_active=1,updated_at=? WHERE login=?",
                        (account["password"], account["server"], now, account["login"]),
                    )
            else:
                with db_session() as db:
                    used = {
                        row[0] for row in db.execute(
                            "SELECT folder_path FROM accounts WHERE folder_path IS NOT NULL AND folder_path != ''"
                        )
                    }
                    try:
                        slot = tm.assign_slot(used)
                    except RuntimeError as error:
                        return self._send(503, {"error": str(error)})
                    folder_path = str(slot)
                    db.execute(
                        "INSERT INTO accounts(login,password,server,folder_path,is_active,created_at,updated_at) "
                        "VALUES(?,?,?,?,1,?,?)",
                        (account["login"], account["password"], account["server"], folder_path, now, now),
                    )
            launched, message = tm.ensure_terminal({
                "login": account["login"],
                "password": account["password"],
                "server": account["server"],
                "folder_path": folder_path,
            })
            return self._send(200, {
                "login": account["login"],
                "folder_path": folder_path,
                "launched": launched,
                "message": message,
            })
        match = re.fullmatch(r"/v1/accounts/(\d{4,20})/deactivate", parsed.path)
        if match:
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                account = db.execute(
                    "SELECT folder_path,is_active FROM accounts WHERE login=?", (match.group(1),)
                ).fetchone()
            if not account:
                return self._send(404, {"error": "Unknown account."})
            try:
                tm.stop_account_terminal(account["folder_path"])
            except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
                return self._send(503, {"error": f"Could not stop this account's MT5 terminal: {error}"})
            with db_session() as db:
                db.execute(
                    "UPDATE accounts SET is_active=0,updated_at=? WHERE login=?",
                    (time.time(), match.group(1)),
                )
            return self._send(200, {"status": "deactivated", "login": match.group(1), "terminal_stopped": True})
        if parsed.path == "/v1/orders":
            if not client_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                if not isinstance(payload, dict):
                    raise ValueError("Request body must be an object.")
                login = str(payload.get("login", "")).strip()
                orders = payload.get("orders")
                if not LOGIN_RE.fullmatch(login):
                    raise ValueError("Provide a numeric MT5 login for the orders.")
                if not isinstance(orders, list) or not 1 <= len(orders) <= MAX_BATCH_SIZE:
                    raise ValueError(f"orders must contain 1-{MAX_BATCH_SIZE} orders.")
                validated = [validate_order(order) for order in orders]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                account = db.execute(
                    "SELECT * FROM accounts WHERE login=? AND is_active=1", (login,)
                ).fetchone()
                if not account:
                    return self._send(409, {"error": "Unknown or inactive MT5 account."})
            idempotency_key = self.headers.get("Idempotency-Key", "")
            if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", idempotency_key):
                return self._send(400, {"error": "Provide an Idempotency-Key (8-128 safe characters)."})
            request_hash = hashlib.sha256(
                json.dumps({"login": login, "orders": validated}, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest()
            now = time.time()
            created = [{"id": str(uuid4()), "status": "queued"} for _ in validated]
            response_body = {"orders": created, "count": len(created), "replayed": False}
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute(
                    "SELECT request_hash,response_json FROM batches WHERE idempotency_key=?", (idempotency_key,)
                ).fetchone()
                if previous:
                    db.commit()
                    if previous["request_hash"] != request_hash:
                        return self._send(409, {"error": "Idempotency-Key was already used for a different order batch."})
                    cached = json.loads(previous["response_json"])
                    cached["replayed"] = True
                    return self._send(200, cached)
                db.executemany(
                    "INSERT INTO orders(id,login,symbol,order_type,volume,entry_price,tp_enabled,tp_distance,status,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,?,'queued',?,?)",
                    [
                        (record["id"], login, order["symbol"], order["order_type"], order["volume"],
                         order["entry_price"], int(order["tp_enabled"]), order["tp_distance"], now, now)
                        for record, order in zip(created, validated)
                    ],
                )
                db.execute(
                    "INSERT INTO batches(idempotency_key,request_hash,response_json,created_at) VALUES(?,?,?,?)",
                    (idempotency_key, request_hash, json.dumps(response_body), now),
                )
            if login not in tm.running_logins():
                threading.Thread(target=tm.ensure_terminal, args=(dict(account),), daemon=True).start()
            return self._send(202, response_body)
        match = re.fullmatch(r"/v1/commands/([0-9a-f-]+)/result", parsed.path)
        if match:
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                result = self._read_json()
                if not isinstance(result, dict) or result.get("status") not in {"placed", "rejected"}:
                    raise ValueError("status must be placed or rejected.")
                message = str(result.get("message", ""))[:500]
                ticket = str(result.get("ticket", ""))[:40]
            except (json.JSONDecodeError, ValueError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                existing = db.execute(
                    "SELECT status,ticket,result_message FROM orders WHERE id=?", (match.group(1),)
                ).fetchone()
                if not existing:
                    return self._send(404, {"error": "Unknown order."})
                if existing["status"] != "claimed":
                    if (existing["status"] == result["status"] and
                            (existing["ticket"] or "") == ticket and
                            (existing["result_message"] or "") == message):
                        return self._send(200, {"status": "recorded", "replayed": True})
                    return self._send(409, {"error": "Order already has a different final result."})
                updated = db.execute(
                    "UPDATE orders SET status=?,ticket=?,result_message=?,updated_at=? WHERE id=? AND status='claimed'",
                    (result["status"], ticket or None, message, time.time(), match.group(1)),
                ).rowcount
            if not updated:
                return self._send(404, {"error": "Unknown or already completed order."})
            return self._send(200, {"status": "recorded"})
        if parsed.path == "/v1/prices":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                payload = self._read_json()
                login, ticks = validate_ticks(payload)
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                known = db.execute("SELECT 1 FROM accounts WHERE login=?", (login,)).fetchone()
                if not known:
                    return self._send(403, {"error": "Price login is not a registered JoeMoney account."})
                now = time.time()
                db.executemany(
                                        "INSERT INTO prices(login,symbol,bid,ask,volume_min,volume_max,volume_step,volume_limits_known,updated_at) VALUES(?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(login,symbol) DO UPDATE SET "
                                        "bid=excluded.bid,ask=excluded.ask,volume_min=excluded.volume_min,"
                                        "volume_max=excluded.volume_max,volume_step=excluded.volume_step,"
                                        "volume_limits_known=excluded.volume_limits_known,updated_at=excluded.updated_at",
                                        [(login, tick["symbol"], tick["bid"], tick["ask"], tick["volume_min"],
                                            tick["volume_max"], tick["volume_step"], int(tick["volume_limits_known"]), now) for tick in ticks],
                )
            return self._send(200, {"status": "recorded", "count": len(ticks)})
        if parsed.path == "/v1/terminal/status":
            if not ea_authed(self.headers.get("Authorization", "")):
                return self._send(401, {"error": "Unauthorized"})
            try:
                status = self._read_json()
                login = str(status.get("login", ""))
                connected = bool(status.get("connected"))
                message = str(status.get("message", ""))[:200]
                try:
                    balance = float(status.get("balance", 0))
                except (TypeError, ValueError):
                    return self._send(400, {"error": "balance must be a number."})
                currency = str(status.get("currency", ""))[:16]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                known = db.execute("SELECT 1 FROM accounts WHERE login=?", (login,)).fetchone()
                if not known:
                    return self._send(403, {"error": "Heartbeat login is not a registered JoeMoney account."})
                db.execute(
                    "INSERT INTO terminal_status(login,connected,last_seen,message,balance,currency) VALUES(?,?,?,?,?,?) "
                    "ON CONFLICT(login) DO UPDATE SET connected=excluded.connected,last_seen=excluded.last_seen,"
                    "message=excluded.message,balance=excluded.balance,currency=excluded.currency",
                    (login, int(connected), time.time(), message, balance, currency),
                )
            return self._send(200, {"status": "recorded"})
        return self._send(404, {"error": "Not found"})


def main() -> None:
    if len(BRIDGE_KEY) < 32:
        raise SystemExit("Set JOEMONEY_BRIDGE_KEY (32+ characters) before starting.")
    with db_session():
        pass
    if os.environ.get("JOEMONEY_RECONCILE_ON_BOOT", "1") == "1":
        reconcile_on_boot()
    host = os.environ.get("JOEMONEY_HOST", "127.0.0.1")
    port = int(os.environ.get("JOEMONEY_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), BridgeHandler)
    print("JoeMoney bridge listening at http://%s:%d" % (host, port))
    server.serve_forever()


if __name__ == "__main__":
    main()
