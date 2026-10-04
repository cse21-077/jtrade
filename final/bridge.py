"""Local JoeMoney MT5 command bridge. Uses only the Python standard library."""

from __future__ import annotations

import hmac
import hashlib
import json
import math
import os
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("JOEMONEY_DB_PATH", ROOT / "joemoney.sqlite3"))
CLIENT_TOKEN = os.environ.get("JOEMONEY_CLIENT_TOKEN", "")
EA_TOKEN = os.environ.get("JOEMONEY_EA_TOKEN", "")
MT5_LOGIN = os.environ.get("JOEMONEY_MT5_LOGIN", "")
ALLOWED_ORIGIN = os.environ.get("JOEMONEY_ALLOWED_ORIGIN", "http://localhost:3000")
MAX_BATCH_SIZE = 100
ORDER_TYPES = {
    "MARKET_BUY", "MARKET_SELL", "BUY_LIMIT", "SELL_LIMIT", "BUY_STOP", "SELL_STOP"
}
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._ -]{1,64}$")


def connect_db(path: Path | None = None) -> sqlite3.Connection:
    path = path or DB_PATH
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
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
            message TEXT NOT NULL DEFAULT ''
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


def validate_order(item: object) -> dict:
    if not isinstance(item, dict):
        raise ValueError("Each order must be an object.")
    symbol = item.get("symbol")
    order_type = item.get("order_type")
    if not isinstance(symbol, str) or not SYMBOL_RE.fullmatch(symbol) or "|" in symbol:
        raise ValueError("Symbol must contain 1-64 letters, digits, spaces, dots, underscores, or hyphens.")
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


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = "JoeMoneyBridge/1.0"

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
            return self._send(200, {"status": "ok", "service": "JoeMoney local MT5 bridge"})
        if parsed.path == "/v1/status":
            if not auth_matches(self.headers.get("Authorization", ""), CLIENT_TOKEN):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                row = db.execute("SELECT connected,last_seen,message FROM terminal_status WHERE login=?", (MT5_LOGIN,)).fetchone()
            return self._send(200, {
                "configured_login": MT5_LOGIN or None,
                "terminal_connected": bool(row and row["connected"] and time.time() - row["last_seen"] < 30),
                "last_seen": row["last_seen"] if row else None,
                "message": row["message"] if row else "Waiting for the JoeMoney EA heartbeat.",
            })
        match = re.fullmatch(r"/v1/orders/([0-9a-f-]+)", parsed.path)
        if match:
            if not auth_matches(self.headers.get("Authorization", ""), CLIENT_TOKEN):
                return self._send(401, {"error": "Unauthorized"})
            with db_session() as db:
                row = db.execute("SELECT id,status,ticket,result_message,created_at,updated_at FROM orders WHERE id=?", (match.group(1),)).fetchone()
            if not row:
                return self._send(404, {"error": "Unknown order."})
            return self._send(200, dict(row))
        if parsed.path == "/v1/commands/next":
            if not auth_matches(self.headers.get("Authorization", ""), EA_TOKEN):
                return self._send(401, {"error": "Unauthorized"})
            login = parse_qs(parsed.query).get("login", [""])[0]
            if not MT5_LOGIN or login != MT5_LOGIN:
                return self._send(403, {"error": "EA login does not match the configured local demo account."})
            now = time.time()
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT * FROM orders WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
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
        if parsed.path == "/v1/orders":
            if not auth_matches(self.headers.get("Authorization", ""), CLIENT_TOKEN):
                return self._send(401, {"error": "Unauthorized"})
            if not MT5_LOGIN:
                return self._send(503, {"error": "Set JOEMONEY_MT5_LOGIN to the demo account logged into MT5."})
            try:
                payload = self._read_json()
                orders = payload.get("orders") if isinstance(payload, dict) else None
                if not isinstance(orders, list) or not 1 <= len(orders) <= MAX_BATCH_SIZE:
                    raise ValueError(f"orders must contain 1-{MAX_BATCH_SIZE} orders.")
                validated = [validate_order(order) for order in orders]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            idempotency_key = self.headers.get("Idempotency-Key", "")
            if not re.fullmatch(r"[A-Za-z0-9._:-]{8,128}", idempotency_key):
                return self._send(400, {"error": "Provide an Idempotency-Key (8-128 safe characters)."})
            request_hash = hashlib.sha256(json.dumps(validated, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
            now = time.time()
            created = [{"id": str(uuid4()), "status": "queued"} for _ in validated]
            response_body = {"orders": created, "count": len(created), "replayed": False}
            with db_session() as db:
                db.execute("BEGIN IMMEDIATE")
                previous = db.execute("SELECT request_hash,response_json FROM batches WHERE idempotency_key=?", (idempotency_key,)).fetchone()
                if previous:
                    db.commit()
                    if previous["request_hash"] != request_hash:
                        return self._send(409, {"error": "Idempotency-Key was already used for a different order batch."})
                    cached = json.loads(previous["response_json"])
                    cached["replayed"] = True
                    return self._send(200, cached)
                db.executemany(
                    "INSERT INTO orders(id,symbol,order_type,volume,entry_price,tp_enabled,tp_distance,status,created_at,updated_at) "
                    "VALUES(?,?,?,?,?,?,?,'queued',?,?)",
                    [
                        (record["id"], order["symbol"], order["order_type"], order["volume"], order["entry_price"],
                         int(order["tp_enabled"]), order["tp_distance"], now, now)
                        for record, order in zip(created, validated)
                    ],
                )
                db.execute(
                    "INSERT INTO batches(idempotency_key,request_hash,response_json,created_at) VALUES(?,?,?,?)",
                    (idempotency_key, request_hash, json.dumps(response_body), now),
                )
            return self._send(202, response_body)
        match = re.fullmatch(r"/v1/commands/([0-9a-f-]+)/result", parsed.path)
        if match:
            if not auth_matches(self.headers.get("Authorization", ""), EA_TOKEN):
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
                updated = db.execute(
                    "UPDATE orders SET status=?,ticket=?,result_message=?,updated_at=? WHERE id=? AND status='claimed'",
                    (result["status"], ticket or None, message, time.time(), match.group(1)),
                ).rowcount
            if not updated:
                return self._send(404, {"error": "Unknown or already completed order."})
            return self._send(200, {"status": "recorded"})
        if parsed.path == "/v1/terminal/status":
            if not auth_matches(self.headers.get("Authorization", ""), EA_TOKEN):
                return self._send(401, {"error": "Unauthorized"})
            try:
                status = self._read_json()
                login = str(status.get("login", ""))
                if not MT5_LOGIN or login != MT5_LOGIN:
                    return self._send(403, {"error": "EA login does not match configured demo account."})
                connected = bool(status.get("connected"))
                message = str(status.get("message", ""))[:200]
            except (json.JSONDecodeError, ValueError, AttributeError) as error:
                return self._send(400, {"error": str(error)})
            with db_session() as db:
                db.execute(
                    "INSERT INTO terminal_status(login,connected,last_seen,message) VALUES(?,?,?,?) "
                    "ON CONFLICT(login) DO UPDATE SET connected=excluded.connected,last_seen=excluded.last_seen,message=excluded.message",
                    (login, int(connected), time.time(), message),
                )
            return self._send(200, {"status": "recorded"})
        return self._send(404, {"error": "Not found"})


def main() -> None:
    if len(CLIENT_TOKEN) < 32 or len(EA_TOKEN) < 32 or not MT5_LOGIN.isdigit():
        raise SystemExit("Set JOEMONEY_CLIENT_TOKEN, JOEMONEY_EA_TOKEN, and JOEMONEY_MT5_LOGIN before starting.")
    if secrets.compare_digest(CLIENT_TOKEN, EA_TOKEN):
        raise SystemExit("Client and EA tokens must be different.")
    with db_session():
        pass
    host = os.environ.get("JOEMONEY_HOST", "127.0.0.1")
    port = int(os.environ.get("JOEMONEY_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), BridgeHandler)
    print(f"JoeMoney bridge listening at http://{host}:{port} for demo login {MT5_LOGIN}")
    server.serve_forever()


if __name__ == "__main__":
    main()