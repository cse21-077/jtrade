"""Terminal provisioning and launching for the JoeMoney multi-account bridge.

Stdlib only. Owns everything that touches the Windows MT5 terminals:
terminal slot assignment, startup.ini auto-login,
EA/chart-profile installation, process launching, and running-login detection.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

TERMINALS_DIR = Path(os.environ.get("JOEMONEY_TERMINALS_DIR", r"C:\MT5Terminals\JoeMoney"))
EA_SOURCE = os.environ.get("JOEMONEY_EA_SOURCE", "")
CHART_TEMPLATE = os.environ.get("JOEMONEY_CHART_TEMPLATE", "")
TERMINAL_MASTER = os.environ.get("JOEMONEY_TERMINAL_MASTER", "")
LAUNCH_STAGGER_SEC = float(os.environ.get("JOEMONEY_LAUNCH_STAGGER_SEC", "5"))

_running_cache: tuple[set[str], float] = (set(), 0.0)
_running_lock = threading.Lock()
_last_launch = 0.0
_launch_lock = threading.Lock()


def normalize_folder(path: str) -> str:
    return str(Path(path)).replace("/", "\\").rstrip("\\").lower()


def running_logins(ttl: float = 10.0) -> set[str]:
    """Logins of MT5 terminals currently running, read from each terminal's startup.ini."""
    global _running_cache
    now = time.time()
    with _running_lock:
        cached, cached_at = _running_cache
        if now - cached_at < ttl:
            return set(cached)
    ps_cmd = (
        "Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | ForEach-Object { "
        "$folder = Split-Path $_.ExecutablePath -Parent; "
        "$ini = Join-Path $folder 'startup.ini'; "
        "if (Test-Path $ini) { "
        "$m = (Get-Content $ini -Raw | Select-String 'Login=(\\d+)').Matches; "
        "if ($m) { $m.Groups[1].Value } } }"
    )
    logins: set[str] = set()
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            timeout=15,
        )
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.isdigit():
                logins.add(line)
    except Exception:
        logins = set()
    with _running_lock:
        _running_cache = (logins, now)
    return set(logins)


def stop_managed_terminals(timeout_sec: int = 15) -> None:
    """Close terminals launched from the managed JoeMoney slots directory only."""
    root = str(TERMINALS_DIR.resolve()).replace("'", "''").rstrip("\\") + "\\"
    ps_cmd = (
        f"$root = '{root}'; "
        "$items = Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | "
        "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }; "
        "foreach ($item in $items) { "
        "$process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue; "
        "if ($process) { [void]$process.CloseMainWindow(); "
        f"if (-not $process.WaitForExit({int(timeout_sec) * 1000})) {{ $process.Kill(); $process.WaitForExit() }} "
        "} } "
        "$remaining = Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | "
        "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) }; "
        "if ($remaining) { $remaining | ForEach-Object { $_.ExecutablePath }; exit 1 }"
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
        capture_output=True,
        text=True,
        timeout=timeout_sec + 15,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stdout.strip() or result.stderr.strip() or "Could not close every managed MT5 terminal.")
    global _running_cache
    with _running_lock:
        _running_cache = (set(), 0.0)


def stop_account_terminal(folder_path: str, timeout_sec: int = 15) -> None:
    """Close the MT5 process running from one managed account folder."""
    folder = str(Path(folder_path).resolve()).replace("'", "''").rstrip("\\")
    ps_cmd = (
        f"$folder = '{folder}'; "
        "$items = Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | "
        "Where-Object { $_.ExecutablePath -and "
        "[String]::Equals((Split-Path $_.ExecutablePath -Parent), $folder, [StringComparison]::OrdinalIgnoreCase) }; "
        "foreach ($item in $items) { "
        "$process = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue; "
        "if ($process) { [void]$process.CloseMainWindow(); "
        f"if (-not $process.WaitForExit({int(timeout_sec) * 1000})) {{ $process.Kill(); $process.WaitForExit() }} "
        "} } "
        "$remaining = Get-CimInstance Win32_Process -Filter \"name='terminal64.exe'\" | "
        "Where-Object { $_.ExecutablePath -and "
        "[String]::Equals((Split-Path $_.ExecutablePath -Parent), $folder, [StringComparison]::OrdinalIgnoreCase) }; "
        "if ($remaining) { $remaining | ForEach-Object { $_.ExecutablePath }; exit 1 }"
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
        capture_output=True,
        text=True,
        timeout=timeout_sec + 15,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stdout.strip() or result.stderr.strip() or "Could not close the account MT5 terminal.")
    global _running_cache
    with _running_lock:
        _running_cache = (set(), 0.0)


def assign_slot(used_folders: set[str]) -> Path:
    """Find a terminal folder for a new account: reuse a free existing slot, else clone the master."""
    used = {normalize_folder(folder) for folder in used_folders}
    if TERMINALS_DIR.exists():
        for slot in sorted(TERMINALS_DIR.iterdir()):
            if slot.is_dir() and (slot / "terminal64.exe").exists() and normalize_folder(str(slot)) not in used:
                return slot
    master = Path(TERMINAL_MASTER) if TERMINAL_MASTER else None
    if not master or not (master / "terminal64.exe").exists():
        raise RuntimeError(
            "No free terminal slot and JOEMONEY_TERMINAL_MASTER is not configured to a folder "
            "containing terminal64.exe. Seed the master terminal first."
        )
    TERMINALS_DIR.mkdir(parents=True, exist_ok=True)
    existing = {p.name for p in TERMINALS_DIR.iterdir() if p.is_dir()}
    index = 1
    while f"Slot{index:03d}" in existing:
        index += 1
    target = TERMINALS_DIR / f"Slot{index:03d}"
    shutil.copytree(master, target, ignore=shutil.ignore_patterns("startup.ini"))
    return target


def sync_chart_token(chart_path: Path) -> None:
    """Force the EA token stored inside a chart profile to the configured key.

    Chart profiles persist the expert's input values, so a stale EaToken saved in
    the template would override the EA's compiled default and every request from
    that terminal would be rejected with 401 — regardless of which MT5 server the
    account logs in to. Rewriting the line at launch makes the token independent
    of the server and of whatever value was last saved in the chart.
    """
    token = os.environ.get("JOEMONEY_EA_TOKEN") or os.environ.get("JOEMONEY_BRIDGE_KEY") or ""
    if not token or not chart_path.exists():
        return
    try:
        text = chart_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return
    if "EaToken=" not in text:
        return
    updated = re.sub(r"(?m)^EaToken=.*$", "EaToken=" + token, text)
    if updated != text:
        try:
            chart_path.write_text(updated, encoding="utf-8")
        except OSError:
            pass


def ensure_terminal(account: dict) -> tuple[bool, str]:
    """Launch the terminal for an account row if it is not already running.

    Returns (success, message). Never raises; HTTP handlers turn failures into messages.
    """
    login = str(account["login"])
    if login in running_logins():
        return True, "already running"
    folder = Path(account["folder_path"])
    exe = folder / "terminal64.exe"
    if not exe.exists():
        return False, f"terminal64.exe not found in {folder}"
    global _last_launch
    with _launch_lock:
        wait = LAUNCH_STAGGER_SEC - (time.time() - _last_launch)
        if wait > 0:
            time.sleep(wait)
        _last_launch = time.time()
    warnings: list[str] = []
    try:
        # MT5 parses startup.ini as ANSI; broker passwords are effectively ASCII.
        (folder / "startup.ini").write_text(
            f"[Common]\r\nLogin={login}\r\nPassword={account['password']}\r\nServer={account['server']}\r\n",
            encoding="ascii",
            errors="replace",
        )
        if EA_SOURCE and Path(EA_SOURCE).exists():
            experts = folder / "MQL5" / "Experts"
            experts.mkdir(parents=True, exist_ok=True)
            shutil.copy2(EA_SOURCE, experts / Path(EA_SOURCE).name)
        else:
            warnings.append("EA source not configured; compile and copy the EA manually")
        if CHART_TEMPLATE and Path(CHART_TEMPLATE).exists():
            charts = folder / "MQL5" / "Profiles" / "Charts" / "Default"
            charts.mkdir(parents=True, exist_ok=True)
            target_chart = charts / Path(CHART_TEMPLATE).name
            shutil.copy2(CHART_TEMPLATE, target_chart)
            sync_chart_token(target_chart)
        else:
            warnings.append("chart template not configured; attach the JoeMoney EA to a chart manually")
        subprocess.Popen([str(exe), "/portable", f"/config:{folder / 'startup.ini'}"], cwd=str(folder), close_fds=True)
        return True, "; ".join(warnings) if warnings else "launched"
    except Exception as exc:
        return False, str(exc)[:200]
