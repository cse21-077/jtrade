# student_worker.py
# MaatlaKebs — Per-Student MT5 Worker Process
# MaatlaKebs Copytrading - Production System v3.3
# One instance of this runs per student account
# Started and managed by mt5_manager.py
# FIXES: portable=True, margin-based volume scaling, fresh price retry,
#        result tracking, no emojis, poll timeout 12s, first-trade symbol fix
# ============================================================

import MetaTrader5 as mt5
from flask import Flask, request, jsonify
import logging
import argparse
import time
import sys
import os
import threading
from queue import Queue
from collections import deque, OrderedDict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s][Worker-%(process)d] %(message)s",
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)

app = Flask(__name__)

# ── State ─────────────────────────────────────────────────────
MAGIC_NUMBER   = 20260101
worker_login   = None
worker_pass    = None
worker_server  = None
worker_path    = None
connected      = False
trade_queue    = Queue(maxsize=100)
mt5_lock       = threading.Lock()
selected_symbols = set()
selected_symbols_lock = threading.Lock()

MAX_PROCESSED_TICKETS = 1000
processed_tickets = deque(maxlen=MAX_PROCESSED_TICKETS)
processed_tickets_lock = threading.Lock()

# Result tracking — keyed by mentor_ticket so manager can poll actual execution
MAX_TRADE_RESULTS = 200
trade_results = OrderedDict()
trade_results_lock = threading.Lock()

COMMON_SYMBOLS = [
    "FX Vol 20", "FX Vol 40", "FX Vol 60", "FX Vol 80", "FX Vol 99",
    "PainX 400", "PainX 600", "PainX 800", "PainX 999", "PainX 1200",
    "GainX 400", "GainX 600", "GainX 800", "GainX 999", "GainX 1200",
]


# ── MT5 Connection ────────────────────────────────────────────

def connect() -> bool:
    global connected
    try:
        with mt5_lock:
            mt5.shutdown()
        time.sleep(0.3)

        init_kwargs = {
            "login":    int(worker_login),
            "password": str(worker_pass),
            "server":   str(worker_server),
            "timeout":  15000,
            "portable": True
        }

        if worker_path and os.path.exists(worker_path):
            terminal_exe = os.path.join(worker_path, "terminal64.exe")
            if os.path.exists(terminal_exe):
                init_kwargs["path"] = terminal_exe

        with mt5_lock:
            result = mt5.initialize(**init_kwargs)

        if result:
            with mt5_lock:
                info = mt5.account_info()
            if info:
                connected = True
                logger.info(f"[OK] Connected | Login: {info.login} | Balance: {info.balance:.2f}")
                threading.Thread(target=preselect_symbols, daemon=True).start()
                return True
            else:
                logger.error("[ERROR] MT5 initialized but cannot get account info")

        error = mt5.last_error()
        logger.error(f"[ERROR] Connection failed: {error}")
        connected = False
        return False

    except Exception as e:
        logger.error(f"[ERROR] Connect exception: {e}")
        connected = False
        return False


def preselect_symbols():
    time.sleep(2)
    selected = 0
    for sym in COMMON_SYMBOLS:
        try:
            with mt5_lock:
                if mt5.symbol_select(sym, True):
                    mt5.symbol_info_tick(sym)
                    with selected_symbols_lock:
                        selected_symbols.add(sym)
                    selected += 1
        except Exception:
            pass
    logger.info(f"[INFO] Pre-selected {selected}/{len(COMMON_SYMBOLS)} symbols")


def ensure_symbol_selected(symbol: str):
    """
    Ensure symbol is selected and warmed up in MT5 market watch.
    Called before any tick or margin fetch so the first-trade edge case
    (symbol not yet in market watch) never causes a fallback to unscaled volume.
    """
    with selected_symbols_lock:
        already = symbol in selected_symbols

    if not already:
        with mt5_lock:
            ok = mt5.symbol_select(symbol, True)
            if ok:
                mt5.symbol_info_tick(symbol)  # warm up so tick is available immediately
        if ok:
            with selected_symbols_lock:
                selected_symbols.add(symbol)
            logger.info(f"[INFO] Symbol selected on demand: {symbol}")
        else:
            logger.error(f"[ERROR] symbol_select failed for {symbol}")


def ensure_connected() -> bool:
    global connected
    if connected:
        try:
            with mt5_lock:
                if mt5.account_info() is not None:
                    return True
        except Exception:
            pass
        connected = False
        logger.warning("[WARN] Connection lost, reconnecting...")
    return connect()


def get_filling_mode(symbol: str) -> int:
    with mt5_lock:
        info = mt5.symbol_info(symbol)
    if info is None:
        return mt5.ORDER_FILLING_FOK
    filling = info.filling_mode
    if filling & 1:
        return mt5.ORDER_FILLING_FOK
    elif filling & 2:
        return mt5.ORDER_FILLING_IOC
    else:
        return mt5.ORDER_FILLING_RETURN


# ── Trade Execution (Thread-Safe) ─────────────────────────────

def _is_ticket_processed(mentor_ticket: str) -> bool:
    if not mentor_ticket:
        return False
    with processed_tickets_lock:
        return mentor_ticket in processed_tickets


def _mark_ticket_processed(mentor_ticket: str):
    if not mentor_ticket:
        return
    with processed_tickets_lock:
        processed_tickets.append(mentor_ticket)


def _store_trade_result(mentor_ticket: str, result: dict):
    """Store execution result so manager can poll for actual outcome."""
    if not mentor_ticket:
        return
    with trade_results_lock:
        trade_results[mentor_ticket] = result
        while len(trade_results) > MAX_TRADE_RESULTS:
            trade_results.popitem(last=False)


def _calculate_student_volume(symbol: str, order_type: str, requested_volume: float) -> float:
    """
    Ask MT5 exactly how much margin this trade requires.
    If student can afford it, use mentor volume as-is.
    If not, scale down proportionally with a 10% safety buffer.

    FIXED: ensure_symbol_selected() is called first so tick data is always
    available — even on the very first trade for a symbol not in COMMON_SYMBOLS.
    Without this, symbol_info_tick returns None and we fall back to the full
    unscaled volume, risking retcode=10019 for low-balance students.
    """
    try:
        # Always ensure symbol is in market watch before fetching tick or margin
        ensure_symbol_selected(symbol)

        with mt5_lock:
            info = mt5.account_info()
            if not info:
                logger.warning(f"[WARN] No account info for volume calc, using {requested_volume}")
                return requested_volume

            tick = mt5.symbol_info_tick(symbol)
            if not tick:
                logger.warning(f"[WARN] No tick for margin calc on {symbol}, using {requested_volume}")
                return requested_volume

            trade_type = mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL
            price = tick.ask if order_type == "BUY" else tick.bid
            margin_required = mt5.order_calc_margin(trade_type, symbol, requested_volume, price)

            if margin_required is None:
                logger.warning(f"[WARN] Cannot calculate margin for {symbol}, using {requested_volume}")
                return requested_volume

            if margin_required <= 0:
                return requested_volume

            free_margin = info.margin_free

            if margin_required <= free_margin:
                # Student can afford mentor volume — use it unchanged
                return requested_volume

            # Scale down to what student can afford, with 10% safety buffer
            ratio = free_margin / margin_required
            scaled = round(requested_volume * ratio * 0.9, 2)
            final = max(scaled, 0.01)
            logger.info(
                f"[SCALE] margin_req={margin_required:.2f} free={free_margin:.2f} "
                f"volume {requested_volume} -> {final}"
            )
            return final

    except Exception as e:
        logger.error(f"[ERROR] Volume calc failed: {e}")
        return requested_volume


def _execute_trade_sync(symbol: str, order_type: str, volume: float, mentor_ticket: str = "") -> dict:
    """Synchronous trade execution — thread-safe, retry with fresh price each attempt."""
    global connected

    if _is_ticket_processed(mentor_ticket):
        logger.info(f"[SKIP] Trade {mentor_ticket} already processed")
        return {"status": "skipped", "reason": "already_processed"}

    try:
        if not ensure_connected():
            return {"status": "failed", "error": "Not connected to MT5"}

        # Scale volume based on student's actual free margin.
        # ensure_symbol_selected is called inside _calculate_student_volume
        # so symbol will be ready for order_send below as well.
        volume = _calculate_student_volume(symbol, order_type, volume)
        if volume < 0.01:
            return {"status": "failed", "error": "Insufficient margin for minimum lot size"}

        trade_type = mt5.ORDER_TYPE_BUY if order_type == "BUY" else mt5.ORDER_TYPE_SELL
        filling = get_filling_mode(symbol)

        # Up to 2 attempts with a fresh price fetch each time
        result = None
        for attempt in range(2):
            with mt5_lock:
                tick = mt5.symbol_info_tick(symbol)
                if not tick:
                    if attempt == 0:
                        time.sleep(0.3)
                        continue
                    return {"status": "failed", "error": f"No tick data for {symbol}"}

                price = tick.ask if order_type == "BUY" else tick.bid

                order = {
                    "action":       mt5.TRADE_ACTION_DEAL,
                    "symbol":       symbol,
                    "volume":       volume,
                    "type":         trade_type,
                    "price":        price,
                    "deviation":    20,
                    "magic":        MAGIC_NUMBER,
                    "comment":      f"MaatlaKebs_{mentor_ticket}",
                    "type_time":    mt5.ORDER_TIME_GTC,
                    "type_filling": filling,
                }

                result = mt5.order_send(order)

            if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                _mark_ticket_processed(mentor_ticket)
                logger.info(
                    f"[OK] Trade executed: {symbol} {order_type} {volume} lots "
                    f"| ticket={result.order} | price={result.price}"
                )
                return {"status": "success", "ticket": result.order, "price": result.price}

            retcode = result.retcode if result else "None"
            logger.warning(f"[WARN] Attempt {attempt + 1} failed: retcode={retcode}")

            if attempt == 0:
                time.sleep(0.3)

        error_msg = f"Trade failed: retcode={result.retcode if result else 'None'}"
        logger.error(f"[ERROR] {error_msg}")
        return {"status": "failed", "retcode": result.retcode if result else None, "error": error_msg}

    except Exception as e:
        logger.error(f"[ERROR] Trade exception: {e}")
        return {"status": "failed", "error": str(e)}


def trade_worker_loop():
    logger.info("[START] Trade worker loop running")

    while True:
        try:
            trade_data = trade_queue.get()
            if trade_data is None:
                break

            qsize = trade_queue.qsize()
            if qsize > 70:
                logger.warning(f"[WARN] Queue high: {qsize}/100")

            symbol        = trade_data["symbol"]
            order_type    = trade_data["order_type"]
            volume        = trade_data["volume"]
            mentor_ticket = trade_data.get("mentor_ticket", "")

            logger.info(f"[EXEC] Processing: {symbol} {order_type} {volume} | ticket={mentor_ticket}")

            result = _execute_trade_sync(symbol, order_type, volume, mentor_ticket)

            # Always store actual MT5 result so manager can poll for true outcome
            _store_trade_result(mentor_ticket, result)

            if result.get("status") not in ("success", "skipped"):
                logger.error(f"[ERROR] Trade outcome: {result.get('error')}")

        except Exception as e:
            logger.error(f"[ERROR] Trade worker error: {e}")
        finally:
            trade_queue.task_done()


# ── Flask Routes ──────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    """Health check — never blocks, never calls MT5."""
    return jsonify({
        "status":     "ok" if connected else "disconnected",
        "login":      worker_login,
        "connected":  connected,
        "queue_size": trade_queue.qsize(),
        "queue_full": trade_queue.full(),
        "timestamp":  time.time()
    })


@app.route("/trade", methods=["POST"])
def execute_trade():
    """Accept trade instantly and queue it. Non-blocking."""
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400

    symbol        = data.get("symbol")
    order_type    = data.get("order_type")
    volume        = float(data.get("volume", 0.01))
    mentor_ticket = data.get("mentor_ticket", "")

    if not symbol or not order_type:
        return jsonify({"status": "failed", "error": "symbol and order_type required"}), 400

    if trade_queue.full():
        logger.warning("[WARN] Queue full — rejecting trade")
        return jsonify({"status": "failed", "error": "Queue full"}), 503

    # Pre-register as pending so manager can poll immediately
    _store_trade_result(mentor_ticket, {"status": "pending"})

    trade_queue.put_nowait({
        "symbol":        symbol,
        "order_type":    order_type,
        "volume":        volume,
        "mentor_ticket": mentor_ticket
    })

    logger.info(f"[QUEUE] Queued: {symbol} {order_type} {volume} | ticket={mentor_ticket} | qsize={trade_queue.qsize()}")

    return jsonify({"status": "queued", "queue_size": trade_queue.qsize()}), 202


@app.route("/result/<mentor_ticket>", methods=["GET"])
def get_result(mentor_ticket):
    """
    Poll for actual MT5 execution result.
    Returns 'pending' while trade is still in queue or executing.
    Returns actual result once MT5 has responded.
    """
    with trade_results_lock:
        result = trade_results.get(mentor_ticket)
    if result is None:
        return jsonify({"status": "pending"}), 202
    return jsonify(result), 200


@app.route("/close", methods=["POST"])
def close_positions():
    """Close all positions for a symbol by MAGIC_NUMBER — thread-safe."""
    data = request.json
    if not data:
        return jsonify({"status": "failed", "error": "Empty body"}), 400

    symbol = data.get("symbol")
    if not symbol:
        return jsonify({"status": "failed", "error": "symbol required"}), 400

    def _close_task():
        try:
            if not ensure_connected():
                return

            with mt5_lock:
                positions = mt5.positions_get(symbol=symbol)

            if not positions:
                logger.info(f"[INFO] No open positions for {symbol}")
                return

            for pos in positions:
                if pos.magic != MAGIC_NUMBER:
                    continue

                with mt5_lock:
                    tick = mt5.symbol_info_tick(symbol)

                if not tick:
                    logger.error(f"[ERROR] No tick for close on {symbol}")
                    continue

                close_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask

                order = {
                    "action":       mt5.TRADE_ACTION_DEAL,
                    "symbol":       symbol,
                    "volume":       pos.volume,
                    "type":         close_type,
                    "position":     pos.ticket,
                    "price":        price,
                    "deviation":    20,
                    "magic":        MAGIC_NUMBER,
                    "comment":      "MaatlaKebs_Close",
                    "type_time":    mt5.ORDER_TIME_GTC,
                    "type_filling": get_filling_mode(symbol),
                }

                with mt5_lock:
                    result = mt5.order_send(order)

                if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                    logger.info(f"[OK] Closed position {pos.ticket}")
                else:
                    retcode = result.retcode if result else "None"
                    logger.error(f"[ERROR] Close failed for {pos.ticket}: retcode={retcode}")

        except Exception as e:
            logger.error(f"[ERROR] Close task error: {e}")

    threading.Thread(target=_close_task, daemon=True).start()
    return jsonify({"status": "queued"}), 202


# ── Keepalive ─────────────────────────────────────────────────

def keepalive_loop():
    def _loop():
        while True:
            time.sleep(5)
            try:
                global connected
                if not connected:
                    connect()
                else:
                    with mt5_lock:
                        if mt5.account_info() is None:
                            connected = False
                            logger.warning("[WARN] Keepalive: connection lost")
            except Exception as e:
                logger.error(f"[ERROR] Keepalive error: {e}")
                connected = False

    threading.Thread(target=_loop, daemon=True).start()


def shutdown():
    logger.info("[STOP] Shutting down worker...")
    trade_queue.put(None)
    with mt5_lock:
        mt5.shutdown()


# ── Entry Point ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MaatlaKebs Student Worker v3.3")
    parser.add_argument("--login",    required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--server",   required=True)
    parser.add_argument("--path",     default="")
    parser.add_argument("--port",     required=True, type=int)
    args = parser.parse_args()

    worker_login  = args.login
    worker_pass   = args.password
    worker_server = args.server
    worker_path   = args.path

    print("=" * 55, flush=True)
    logger.info(f"[START] MaatlaKebs Worker v3.3 | Login: {worker_login} | Port: {args.port}")
    logger.info(f"[INFO] Queue:100 | Dedupe:{MAX_PROCESSED_TICKETS} | Results:{MAX_TRADE_RESULTS} | portable=True")
    print("=" * 55, flush=True)

    if not connect():
        logger.error("[FATAL] Initial connection failed — exiting")
        sys.exit(1)

    threading.Thread(target=trade_worker_loop, daemon=True).start()
    keepalive_loop()

    import atexit
    atexit.register(shutdown)

    logger.info(f"[OK] Worker ready on port {args.port}")

    try:
        from waitress import serve
        serve(app, host="127.0.0.1", port=args.port, threads=8)
    except ImportError:
        app.run(host="127.0.0.1", port=args.port, debug=False, threaded=True)