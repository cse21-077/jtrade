# mt5_manager.py
# MaatlaKebs — MT5 Manager v5.0 (EA Slave Architecture)
# ============================================================
# ARCHITECTURE CHANGE:
#   OLD: Python workers spawned per student, HTTP forwarding, IPC to MT5
#   NEW: Python writes signal files, EA reads and executes inside MT5
#
# WHY WE SWITCHED:
#   Python workers had fatal IPC timeouts (-10005) on cold MT5 terminals.
#   12 paying clients received ZERO trades on May 13, 2026.
#   Pre-warming, staggered startup, and 30s timeouts couldn't fix it.
#   EA runs INSIDE MT5 — no IPC needed. No workers to manage.
#
# HOW IT WORKS:
#   1. Receives HTTP POST from Hetzner Celery with signal data
#   2. Fetches active students from Supabase (filtered by trader_id)
#   3. Writes ONE file per student via FILE_COMMON path:
#      %APPDATA%\MetaQuotes\Terminal\Common\Files\MaatlaKebs\signals\{login}.json
#   4. Returns immediately — does NOT wait for execution
#   5. Background thread collects result files from Common\Files\MaatlaKebs\results\
#   6. Background thread monitors terminal health, updates connection_status
#
# PORTABLE MT5 NOTE:
#   All signal/result folders MUST point to MetaQuotes Common\Files directory.
#   This is the shared folder that MT5's FILE_COMMON flag resolves to,
#   regardless of which portable terminal instance is running.
# ============================================================

import json
import os
import glob
import time
import uuid
import threading
import logging
import sys
import subprocess
from datetime import datetime, timezone

import requests as http_requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, jsonify

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Manager] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL     = os.environ.get("SUPABASE_URL", "https://yrnjemftbqwvbvknlxol.supabase.co")
SUPABASE_KEY     = os.environ.get("SUPABASE_SERVICE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmplbWZ0YnF3dmJ2a25seG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk1ODMyMSwiZXhwIjoyMDg3NTM0MzIxfQ.3Mh_msfKAq0gwVyad6A-VqvTEIfYzi9LYjVKrtO8g0g")
PROVISION_SECRET = os.environ.get("PROVISION_SECRET", "9ecf9109adf78a9bdda26cfae02227d7")
# --- Common MetaQuotes shared folder (FILE_COMMON in MQL5 resolves here) ---
_COMMON_FILES = os.path.join(
    os.environ.get("APPDATA", r"C:\Users\Administrator\AppData\Roaming"),
    r"MetaQuotes\Terminal\Common\Files"
)
SIGNALS_FOLDER   = os.environ.get("SIGNALS_FOLDER",   os.path.join(_COMMON_FILES, "MaatlaKebs", "signals"))
RESULTS_FOLDER   = os.environ.get("RESULTS_FOLDER",   os.path.join(_COMMON_FILES, "MaatlaKebs", "results"))
STATUS_FOLDER    = os.environ.get("STATUS_FOLDER",    os.path.join(_COMMON_FILES, "MaatlaKebs", "status"))
RESULT_SCAN_INTERVAL = int(os.environ.get("RESULT_SCAN_INTERVAL", "5"))
STATUS_SCAN_INTERVAL = int(os.environ.get("STATUS_SCAN_INTERVAL", "30"))
STALE_SIGNAL_SECONDS = int(os.environ.get("STALE_SIGNAL_SECONDS", "60"))
STUDENT_CACHE_SECONDS = 30
CONNECTION_CHECK_INTERVAL = 300  # 5 min fallback; primary checks are on-demand via /check-connections

session = http_requests.Session()
retry_strategy = Retry(total=2, backoff_factor=0.2)
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=50, pool_maxsize=50)
session.mount("http://", adapter)
session.mount("https://", adapter)

os.makedirs(SIGNALS_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)
os.makedirs(STATUS_FOLDER, exist_ok=True)

# ── Threading Locks ───────────────────────────────────────────
_signal_locks = {}
_locks_lock = threading.Lock()

def _get_lock(login: str) -> threading.Lock:
    with _locks_lock:
        if login not in _signal_locks:
            _signal_locks[login] = threading.Lock()
        return _signal_locks[login]

# ── Student Cache ─────────────────────────────────────────────
_students_cache = []
_students_cache_time = 0
_students_cache_lock = threading.Lock()

_running_logins_cache = (set(), 0.0)
_running_logins_lock = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────
def supabase_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal"
    }

def fetch_active_students(trader_id: str = None, force_refresh: bool = False) -> list:
    global _students_cache, _students_cache_time
    
    with _students_cache_lock:
        if (not force_refresh and 
            time.time() - _students_cache_time < STUDENT_CACHE_SECONDS and 
            _students_cache):
            if trader_id:
                return [s for s in _students_cache if s.get("trader_id") == trader_id]
            return list(_students_cache)
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?is_active=eq.true&select=user_id,mt5_login,trader_id,folder_path"
        if trader_id:
            url += f"&trader_id=eq.{trader_id}"
        
        resp = session.get(url, headers=supabase_headers(), timeout=10)
        if resp.status_code == 200:
            students = resp.json()
            with _students_cache_lock:
                _students_cache = students
                _students_cache_time = time.time()
            logger.info(f"Fetched {len(students)} active students" + (f" for trader={trader_id}" if trader_id else ""))
            return students
        else:
            logger.error(f"Supabase error {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Failed to fetch students: {e}")
    
    with _students_cache_lock:
        if _students_cache:
            logger.warning("Using stale student cache")
            if trader_id:
                return [s for s in _students_cache if s.get("trader_id") == trader_id]
            return list(_students_cache)
    return []

def push_results_to_supabase(results: list):
    if not results:
        return
    # Strip fields that don't exist in the trade_logs schema to avoid 400 errors
    allowed_keys = {
        "user_id", "mentor_ticket", "student_ticket", "symbol", "order_type",
        "volume", "entry_price", "stop_loss", "take_profit", "status",
        "strategy_type", "error_message", "executed_at"
    }
    cleaned = []
    for r in results:
        # Map EA result fields to schema columns
        mapped = {
            "user_id": r.get("user_id") or r.get("login"),
            "mentor_ticket": r.get("mentor_ticket", ""),
            "student_ticket": str(r.get("exec_ticket", "")) if r.get("exec_ticket") else None,
            "symbol": r.get("symbol", ""),
            "order_type": r.get("order_type", ""),
            "volume": r.get("requested_volume") or r.get("volume"),
            "entry_price": r.get("exec_price"),
            "stop_loss": r.get("sl"),
            "take_profit": r.get("tp"),
            "status": r.get("status", "failed"),
            "error_message": r.get("error") or r.get("error_message"),
            "executed_at": datetime.now(timezone.utc).isoformat()
        }
        # Remove None values so Supabase doesn't complain
        cleaned.append({k: v for k, v in mapped.items() if v is not None})
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/trade_logs"
        resp = session.post(
            url,
            json=cleaned,
            headers={**supabase_headers(), "Prefer": "return=representation"},
            timeout=15
        )
        if resp.status_code in (200, 201):
            logger.info(f"Pushed {len(cleaned)} results to Supabase")
        else:
            logger.error(f"Supabase push {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"Supabase push exception: {e}")

def update_connection_status(
    user_id: str,
    status: str,
    error_message: str = None,
    balance: float = None,
    equity: float = None,
    balance_updated_at: str = None,
):
    try:
        payload = {
            "user_id":       user_id,
            "mt5_status":    status,
            "last_checked":  datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
            "updated_at":    datetime.now(timezone.utc).isoformat()
        }
        if balance is not None:
            payload["balance"] = balance
        if equity is not None:
            payload["equity"] = equity
        if balance_updated_at is not None:
            payload["balance_updated_at"] = balance_updated_at
        patch_url = f"{SUPABASE_URL}/rest/v1/connection_status?user_id=eq.{user_id}"
        resp = session.patch(patch_url, json=payload, headers=supabase_headers(), timeout=5)
        if resp.status_code == 404:
            url = f"{SUPABASE_URL}/rest/v1/connection_status"
            session.post(url, json=payload, headers={**supabase_headers(), "Prefer": "return=minimal"}, timeout=5)
    except Exception as e:
        logger.error(f"Failed to update connection status for {user_id}: {e}")

def cleanup_stale_files():
    now = time.time()
    for f in glob.glob(os.path.join(SIGNALS_FOLDER, "*.json")):
        try:
            if now - os.path.getmtime(f) > STALE_SIGNAL_SECONDS:
                os.remove(f)
                logger.warning(f"Removed stale signal: {os.path.basename(f)}")
        except Exception:
            pass
    for f in glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json")):
        try:
            if now - os.path.getmtime(f) > 300:
                os.remove(f)
        except Exception:
            pass
    for f in glob.glob(os.path.join(STATUS_FOLDER, "*.json")):
        try:
            if now - os.path.getmtime(f) > 300:
                os.remove(f)
        except Exception:
            pass

def get_running_logins() -> set:
    """Query all running terminal64.exe processes and read Login= from their startup.ini.
    Returns a set of MT5 login numbers (as strings) that are currently active.
    This is the ONLY reliable way to know which account is logged into each terminal.
    """
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | ForEach-Object { "
        "$folder = Split-Path $_.ExecutablePath -Parent; "
        "$ini = Join-Path $folder 'startup.ini'; "
        "if (Test-Path $ini) { "
        "$m = (Get-Content $ini -Raw | Select-String 'Login=(\\d+)').Matches; "
        "if ($m) { $m.Groups[1].Value } } }"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True, text=True, timeout=15
        )
        logins = set()
        for line in result.stdout.splitlines():
            line = line.strip()
            if line and line.isdigit():
                logins.add(line)
        if logins:
            logger.info(f"Detected {len(logins)} active logins from running terminals")
        return logins
    except Exception as e:
        logger.error(f"Failed to query running terminal logins: {e}")
        return set()


def get_running_logins_cached(ttl: int = 10) -> set:
    global _running_logins_cache
    now = time.time()
    with _running_logins_lock:
        cached_logins, cached_ts = _running_logins_cache
        if now - cached_ts < ttl:
            return cached_logins

    fresh = get_running_logins()
    with _running_logins_lock:
        _running_logins_cache = (fresh, now)
    return fresh


def write_signal_files(signal_data: dict, students: list) -> tuple:
    batch_id = str(uuid.uuid4())
    timestamp = int(time.time())
    written = 0
    failed = []
    
    for student in students:
        login = str(student.get("mt5_login", ""))
        if not login:
            continue
        
        payload = {
            "batch_id": batch_id,
            "timestamp": timestamp,
            "action": signal_data.get("action", "OPEN"),
            "symbol": signal_data.get("symbol", ""),
            "order_type": signal_data.get("order_type", ""),
            "volume": float(signal_data.get("volume", 0)),
            "mentor_ticket": str(signal_data.get("mentor_ticket", "")),
            "sl": float(signal_data.get("sl", 0)),
            "tp": float(signal_data.get("tp", 0)),
            "student_id": student.get("user_id", ""),
            "login": login
        }
        
        filepath = os.path.join(SIGNALS_FOLDER, f"{login}.json")
        tmppath = filepath + ".tmp"
        lock = _get_lock(login)
        
        acquired = lock.acquire(blocking=True, timeout=5.0)
        if not acquired:
            logger.error(f"Lock timeout for {login}")
            failed.append(login)
            continue
        
        try:
            with open(tmppath, "w") as f:
                json.dump(payload, f)
            os.replace(tmppath, filepath)
            written += 1
        except Exception as e:
            logger.error(f"Write failed for {login}: {e}")
            failed.append(login)
        finally:
            lock.release()
    
    logger.info(f"Wrote {written}/{len(students)} signals (batch={batch_id[:8]})")
    return written, failed

# ── Flask Routes ──────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    try:
        signal_count = len(glob.glob(os.path.join(SIGNALS_FOLDER, "*.json")))
        result_count = len(glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json")))
        with _students_cache_lock:
            cached = len(_students_cache)
        return jsonify({
            "status": "ok",
            "pending_signals": signal_count,
            "pending_results": result_count,
            "cached_students": cached,
            "time": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/signal", methods=["POST"])
def receive_signal():
    try:
        data = request.json
        if not data:
            return jsonify({"status": "failed", "error": "Empty body"}), 400
        
        symbol = data.get("symbol")
        order_type = data.get("order_type")
        volume = data.get("volume")
        action = data.get("action", "OPEN")
        mentor_ticket = data.get("mentor_ticket", str(uuid.uuid4()))
        trader_id = data.get("trader_id", "")
        sl = data.get("stop_loss", 0)
        tp = data.get("take_profit", 0)
        
        if not symbol or not order_type or volume is None:
            return jsonify({"status": "failed", "error": "symbol, order_type, volume required"}), 400
        
        students = fetch_active_students(trader_id if trader_id else None)
        if not students:
            return jsonify({"status": "failed", "error": "No active students"}), 404
        
        signal_data = {
            "action": action,
            "symbol": symbol,
            "order_type": order_type,
            "volume": float(volume),
            "mentor_ticket": str(mentor_ticket),
            "sl": float(sl),
            "tp": float(tp),
        }
        
        written, failed = write_signal_files(signal_data, students)
        
        return jsonify({
            "status": "written",
            "batch_id": str(uuid.uuid4())[:8],
            "students_total": len(students),
            "files_written": written,
            "files_failed": len(failed),
            "failed_logins": failed,
        })
    except Exception as e:
        logger.error(f"Signal error: {e}")
        return jsonify({"status": "failed", "error": str(e)}), 500

@app.route("/refresh-students", methods=["POST"])
def refresh_students():
    try:
        body = request.json or {}
        trader_id = body.get("trader_id", "")
        students = fetch_active_students(trader_id if trader_id else None, force_refresh=True)
        return jsonify({
            "status": "refreshed",
            "count": len(students),
            "trader_id": trader_id or "all"
        })
    except Exception as e:
        return jsonify({"status": "failed", "error": str(e)}), 500

@app.route("/check-connections", methods=["POST"])
def check_connections():
    """On-demand connection check for ALL active students. Updates Supabase immediately.
    Matches by MT5 login ID read from each running terminal's startup.ini —
    this is the only way to know the CORRECT account is logged in.
    """
    try:
        students = fetch_active_students(force_refresh=True)
        running_logins = get_running_logins_cached()
        
        updated = []
        for student in students:
            user_id = student.get("user_id")
            login = str(student.get("mt5_login", ""))
            folder = student.get("folder_path", "")
            
            if not folder:
                update_connection_status(user_id, "DISCONNECTED", "No folder_path assigned")
                updated.append({"user_id": user_id, "mt5_login": login, "status": "DISCONNECTED", "reason": "no_folder"})
                continue
            
            # The ONLY reliable check: is this login active in a running terminal?
            is_connected = login in running_logins
            
            if is_connected:
                status = "CONNECTED"
                error_msg = None
                logger.info(f"CONNECTED {login}")
            else:
                status = "DISCONNECTED"
                error_msg = "Terminal not running or wrong account logged in"
                logger.info(f"DISCONNECTED {login}")
            
            update_connection_status(user_id, status, error_msg)
            updated.append({"user_id": user_id, "mt5_login": login, "status": status, "error": error_msg})
        
        connected_count = sum(1 for u in updated if u["status"] == "CONNECTED")
        logger.info(f"Live check complete: {connected_count}/{len(updated)} connected")
        
        return jsonify({
            "status": "checked",
            "total": len(updated),
            "connected": connected_count,
            "disconnected": len(updated) - connected_count,
            "students": updated
        })
    except Exception as e:
        logger.error(f"Check connections error: {e}")
        return jsonify({"status": "failed", "error": str(e)}), 500

@app.route("/provision", methods=["POST"])
def provision_student():
    secret = request.headers.get("X-Provision-Secret", "")
    if not PROVISION_SECRET or secret != PROVISION_SECRET:
        return jsonify({"status": "failed", "error": "Unauthorized"}), 401
    
    data = request.json or {}
    user_id = data.get("user_id", "").strip()
    if not user_id:
        return jsonify({"status": "failed", "error": "user_id required"}), 400
    
    try:
        url = f"{SUPABASE_URL}/rest/v1/student_accounts?select=folder_path&folder_path=not.is.null"
        resp = session.get(url, headers=supabase_headers(), timeout=10)
        assigned = set()
        if resp.status_code == 200:
            for row in resp.json():
                fp = row.get("folder_path", "")
                if fp:
                    assigned.add(fp.replace("/", "\\").rstrip("\\").split("\\")[-1])
    except Exception:
        assigned = set()
    
    TERMINAL_BASE = r"C:\MT5Terminals"
    GHOST_SLOTS = {"Student001", "Student002", "Student003"}
    MAX_SLOT = 53
    
    for i in range(4, MAX_SLOT + 1):
        slot_name = f"Student{i:03d}"
        if slot_name in GHOST_SLOTS or slot_name in assigned:
            continue
        folder_path = os.path.join(TERMINAL_BASE, slot_name)
        if os.path.exists(os.path.join(folder_path, "terminal64.exe")):
            try:
                patch_url = f"{SUPABASE_URL}/rest/v1/student_accounts?user_id=eq.{user_id}"
                session.patch(patch_url, json={"folder_path": folder_path}, headers=supabase_headers(), timeout=10)
                logger.info(f"Provisioned {user_id[:8]} -> {slot_name}")
                return jsonify({"status": "success", "folder_path": folder_path, "slot": slot_name})
            except Exception:
                return jsonify({"status": "failed", "error": "DB update failed"}), 500
    
    return jsonify({"status": "failed", "error": "No slots available"}), 503

# ── Background Threads ────────────────────────────────────────
def result_collector_loop():
    logger.info("Result collector started")
    while True:
        try:
            files = glob.glob(os.path.join(RESULTS_FOLDER, "*_result.json"))
            if files:
                batch = []
                for fp in files:
                    try:
                        # utf-8-sig strips BOM if present; fallback to utf-16 for
                        # any files written before FILE_ANSI was added to the EA
                        try:
                            with open(fp, "r", encoding="utf-8-sig") as f:
                                data = json.load(f)
                        except (UnicodeDecodeError, ValueError):
                            with open(fp, "r", encoding="utf-16") as f:
                                data = json.load(f)
                        batch.append(data)
                        os.remove(fp)
                    except Exception as e:
                        logger.error(f"Bad result file {fp}: {e}")
                
                if batch:
                    push_results_to_supabase(batch)
                    logger.info(f"Collected {len(batch)} results")
            
            cleanup_stale_files()
        except Exception as e:
            logger.error(f"Collector error: {e}")
        time.sleep(RESULT_SCAN_INTERVAL)

def connection_monitor_loop():
    """Monitor running MT5 terminals and update connection_status in Supabase.
    Matches by MT5 login ID read from each terminal's startup.ini.
    """
    logger.info("Connection monitor started")
    while True:
        try:
            students = fetch_active_students(force_refresh=True)
            running_logins = get_running_logins_cached()
            
            for student in students:
                user_id = student.get("user_id")
                folder = student.get("folder_path", "")
                login = str(student.get("mt5_login", ""))
                
                if not folder:
                    update_connection_status(user_id, "DISCONNECTED", "No folder_path assigned")
                    continue
                
                is_connected = login in running_logins
                if is_connected:
                    update_connection_status(user_id, "CONNECTED")
                else:
                    update_connection_status(user_id, "DISCONNECTED", "Terminal not running or wrong account logged in")
                    
        except Exception as e:
            logger.error(f"Connection monitor error: {e}")
        
        time.sleep(CONNECTION_CHECK_INTERVAL)


def status_collector_loop():
    """Collect periodic status snapshots from the shared status folder.
    Only accepts files for accounts that are currently logged into a running terminal.
    """
    logger.info("Status collector started")
    while True:
        try:
            students = fetch_active_students(force_refresh=True)
            student_map = {
                str(student.get("mt5_login", "")): student.get("user_id")
                for student in students
                if student.get("mt5_login")
            }
            running_logins = get_running_logins_cached()

            files = glob.glob(os.path.join(STATUS_FOLDER, "*.json"))
            if files:
                for fp in files:
                    try:
                        with open(fp, "r", encoding="utf-8-sig") as handle:
                            data = json.load(handle)
                    except Exception as exc:
                        logger.warning(f"Bad status file {fp}: {exc}")
                        continue

                    login = str(data.get("login", "") or "")
                    if not login or login not in running_logins:
                        continue

                    user_id = student_map.get(login)
                    if not user_id:
                        continue

                    balance = data.get("balance")
                    equity = data.get("equity")
                    timestamp = data.get("timestamp")
                    balance_updated_at = None
                    if timestamp is not None:
                        try:
                            balance_updated_at = datetime.fromtimestamp(int(timestamp), tz=timezone.utc).isoformat()
                        except (TypeError, ValueError):
                            balance_updated_at = None

                    update_connection_status(
                        user_id,
                        "CONNECTED",
                        None,
                        None if balance is None else float(balance),
                        None if equity is None else float(equity),
                        balance_updated_at,
                    )
                    os.remove(fp)
            cleanup_stale_files()
        except Exception as e:
            logger.error(f"Status collector error: {e}")
        time.sleep(STATUS_SCAN_INTERVAL)

# ── Entry Point ───────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("MaatlaKebs MT5 Manager v5.0 — EA Slave Architecture", flush=True)
    print(f"Signals: {SIGNALS_FOLDER}", flush=True)
    print(f"Results: {RESULTS_FOLDER}", flush=True)
    print(f"Stale cleanup: {STALE_SIGNAL_SECONDS}s", flush=True)
    print("=" * 60, flush=True)
    
    threading.Thread(target=result_collector_loop, daemon=True).start()
    threading.Thread(target=connection_monitor_loop, daemon=True).start()
    threading.Thread(target=status_collector_loop, daemon=True).start()
    
    try:
        from waitress import serve
        serve(app, host="0.0.0.0", port=5000, threads=32, connection_limit=200)
    except ImportError:
        logger.warning("waitress not found, using Flask dev server")
        app.run(host="0.0.0.0", port=5000, debug=False, threaded=True, use_reloader=False)
