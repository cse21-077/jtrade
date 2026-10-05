# JoeMoney Multi-Account MT5 Bridge

This package runs the MT5 execution side of the JoeMoney PWA on a Windows VPS
(178.238.234.68). Clients enter their MT5 account details (login/password/server) in
the PWA; the bridge stores them in a local SQLite database, starts one portable MT5
terminal per account (auto-login via `startup.ini`, EA pre-attached via a chart
profile), and routes order batches to the right terminal. The JoeMoney EA inside
each terminal polls the bridge over loopback HTTP and submits orders inside MT5.
One shared bridge key protects the API; it is baked into the private PWA build and
the VPS, so clients never authenticate by hand.

## What it supports

- Many MT5 accounts, each in its own portable terminal under `C:\MT5Terminals\JoeMoney\SlotNNN`.
- One shared bridge key (`JOEMONEY_BRIDGE_KEY`) protects every endpoint; it is baked into the PWA build at build time.
- Market BUY/SELL and broker-held BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP orders; one order object per position, up to 100 per batch, idempotent submission via `Idempotency-Key`.
- Optional spot-based TP from the broker quote at execution time (BUY: ask + distance; SELL: bid - distance).
- Terminal supervision: terminals are launched on registration, re-launched when orders arrive for a stopped terminal, and reconciled on bridge start (pre-warm on boot).
- Explicit per-account connection status from the EA heartbeat — bridge or EA polling alone does not mean the broker connection is up.

## VPS Setup and Run (Windows Server)

These steps use the current deployment paths and domain: `C:\JoeMoney\final`,
`C:\MT5Terminals\JoeMoneyMaster`, and `bridge.toporapula.dev`. The master is a
one-time template-building terminal. The bridge starts the per-account portable
terminals.

### 1. Seed and open the master terminal

The master folder was seeded by copying the installed MT5 folder. On a fresh
server, copy it once with:

```powershell
robocopy "C:\Program Files\MetaTrader 5" "C:\MT5Terminals\JoeMoneyMaster" /E
```

Do not repeat the copy over a configured master unless you intend to refresh it.
Open the master in portable mode from a PowerShell window:

```powershell
& "C:\MT5Terminals\JoeMoneyMaster\terminal64.exe" /portable
```

Log in once so MT5 caches the broker server, then log out. If Caddy and the bridge
are already running, use this command by itself; do not run `start-all.ps1` again.

### 2. Compile the EA and save the master chart

1. Copy the EA source into the master terminal's Experts folder:

   ```powershell
   Copy-Item "C:\JoeMoney\final\JoeMoneyBridgeEA.mq5" "C:\MT5Terminals\JoeMoneyMaster\MQL5\Experts\JoeMoneyBridgeEA.mq5" -Force
   ```

   Open that copy in MetaEditor and press **F7**. Confirm the compiled file exists at
   `C:\MT5Terminals\JoeMoneyMaster\MQL5\Experts\JoeMoneyBridgeEA.ex5`.
2. Read the current bridge key from the already-running bridge PowerShell window.
   If the bridge is not running, open `C:\JoeMoney\final` and run
   `.start-all.ps1` once; keep its Caddy and bridge windows open. Use the key
   printed by the bridge. This is one shared key: enter it as the EA's `EaToken`
   and set it as `VITE_JOEMONEY_BRIDGE_KEY` in Vercel. There is no separate EA
   token to create.
3. In the master MT5, open a chart and attach `JoeMoneyBridgeEA`. Set
   `BridgeUrl` to `http://127.0.0.1:8765` and `EaToken` to the current bridge key.
   Enable **Algo Trading**. In MT5 Options > Expert Advisors, allow WebRequest to
   `http://127.0.0.1:8765`.
4. Save the profile with **File > Profiles > Save As**, named `JoeMoney`. Close the
   master MT5, then copy:

   ```text
   C:\MT5Terminals\JoeMoneyMaster\MQL5\Profiles\Charts\JoeMoney\chart01.chr
   ```

   to:

   ```text
   C:\MT5Terminals\JoeMoneyMaster\MQL5\Profiles\Charts\Default\chart01.chr
   ```

   The MT5 profile stores its chart as `chart01.chr` inside the `JoeMoney` profile
   folder. Do not rename the file. The bridge reads it from
   `Charts\JoeMoney\chart01.chr` and copies it into each account slot's
   `Charts\Default\chart01.chr` before launching that portable terminal. This
   carries the EA/chart inputs into new slots. Keep the master closed during
   normal operation so it does not run an extra EA instance.

### 3. DNS, Caddy, and firewall

1. The DNS A record for `bridge.toporapula.dev` must point to `178.238.234.68`.
   Caddy needs a domain name to obtain a public TLS certificate.
2. Caddy needs no installer. Put the downloaded Windows executable, named exactly
   `caddy.exe`, at `C:\JoeMoney\final\caddy.exe` or `C:\Caddy\caddy.exe`.
   `start-caddy.ps1` also checks `PATH`.
3. Allow inbound TCP ports **80** and **443** in Windows Firewall. For example,
   from Administrator PowerShell:

   ```powershell
   New-NetFirewallRule -DisplayName "Caddy HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   New-NetFirewallRule -DisplayName "Caddy HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   ```

   Allow these ports in the Contabo firewall/security settings too, if enabled.
   Leave port `8765` private. Caddy serves HTTPS and renews its certificate.
   This deployment obtained its certificate successfully after public access to
   ports 80/443 was allowed; earlier timeout messages in the log were from before
   that change.

### 4. Set Vercel environment variables

Set these in Vercel Production and redeploy after changing them:

```text
VITE_JOEMONEY_API_URL=https://bridge.toporapula.dev
VITE_JOEMONEY_BRIDGE_KEY=<current key printed by start-bridge.ps1>
```

The bridge saves its DPAPI-protected key at
`C:\ProgramData\JoeMoney\bridge-key.dpapi`, outside the app folder, and reuses it
on later starts and app updates. Run the bridge under the same Windows account
that created the key. The EA `EaToken` and PWA bridge key are this same value; do
not rotate either unless the saved key has intentionally been replaced. If an old
key file is migrated from `C:\JoeMoney\final\secrets`, the bridge reports that
migration. If the stable key cannot be decrypted, startup stops with an error
instead of silently issuing a different key.

Opening `https://bridge.toporapula.dev/v1/accounts` in a browser without an API
key returns `{"error":"Unauthorized"}`. That is expected and confirms HTTPS
reached the authenticated bridge.

### 5. Start normally and apply the template to existing slots

When services are stopped, start normal operation from `C:\JoeMoney\final` with:

```powershell
.\start-all.ps1
```

It opens Caddy and the bridge in separate PowerShell windows. Keep both open. The
bridge reconciles active registered accounts and starts their portable MT5 slot
terminals. Do not manually start slot terminals or rerun `start-all.ps1` while the
services are already running, as that can cause port conflicts.

A slot already running when the chart file is installed will not automatically
load the new template. Close the account's slot terminal, then restart only the
bridge: press **Ctrl+C** in the bridge window and run this from
`C:\JoeMoney\final`:

```powershell
.\start-bridge.ps1
```

The bridge relaunches active accounts and copies the chart template into their
slots. Leave Caddy running; it does not need restarting. Alternatively, attach the
EA manually to an already-running slot chart.

For manual startup after both services have stopped, use `start-caddy.ps1` in one
PowerShell window and `start-bridge.ps1` in another. Do not run these alongside
`start-all.ps1`.

## Test the bridge

Before moving it to the VPS, run the unit tests locally (terminal launching and process detection are mocked):

```powershell
python -m unittest discover -s final -v
```

## PWA flow

Open the installed PWA → **MT5 Credentials** on the splash screen (or `/mt5`) →
enter the account (MT5 login, password, server) → **Connect**. If the bridge key is
not baked into the build, paste it once when asked.
The VPS launches and logs in a terminal for it; the account list shows green when
the terminal is up and the EA heartbeat is live. Select an account, build the order
ladder, and queue. The PWA polls each order until the EA acknowledges it. A queued
response means "accepted by the bridge", not "executed" — confirm trades in MT5.

## Protocol

- `POST /v1/accounts`: `{login, password, server}` → provision/update account and launch its terminal. Passwords are stored in the local SQLite database (plaintext, per deployment decision) and are never returned.
- `GET /v1/accounts`: account list with terminal/EA status, no secrets.
- `POST /v1/accounts/{login}/deactivate`: stops trading for that account.
- `POST /v1/orders`: `{login, orders:[...]}` with `Idempotency-Key`.
- `GET /v1/orders/{id}`: order status.
- `GET /v1/commands/next?login=...` (EA): atomically claims the oldest queued command for that login; payload is the 7-field pipe-delimited line `id|symbol|order_type|volume|entry_price|tp_enabled|tp_distance`.
- `POST /v1/commands/{id}/result` (EA): `placed`/`rejected` acknowledgement with ticket and message.
- `POST /v1/terminal/status` (EA): per-login heartbeat. `connected=true` means the terminal is online **and** the account login succeeded; a failed login never produces an authorized heartbeat for the registered login (it is refused), so the PWA's "pending" state flips to "connected" only after a real MT5 login. `GET /v1/status?login=` (client) reads it.
- `POST /v1/prices` (EA): `{login, ticks:[{symbol,bid,ask}, ...]}` (1-200). The EA reports live ticks for its `ReportSymbols` input every `ReportSeconds` (default 3s); unknown logins are refused.
- `GET /v1/prices` (client): `?login=` and `?symbols=A,B` filters → `{prices:[{login,symbol,bid,ask,age_sec}], now}`. The PWA polls this every 4s and prefers these MT5 quotes over Deriv WebSocket ticks whenever a tick is under 60s old; 30-60s is shown grayed out as degraded.

## Warnings

- **Do not use on live accounts until hardened.** Broker passwords are stored
  unencrypted in `data\joemoney.sqlite3`; anyone with read access to the VPS or a
  copy of the database can trade those accounts. Encryption at rest, real user
  authentication, credential rotation, and administrative kill controls are listed
  as production work in the original demo README and still apply.
- The HTTP response means "queued", not "executed". If the EA is offline, commands
  remain queued until it reconnects; inspect the queue/account before restarting or
  resubmitting.
- For multiple same-symbol fills to remain separate positions, the MT5 account must
  use **hedging** mode; netting accounts combine fills.
- MT5 first-run dialogs (LiveUpdate, news) can delay EA startup; queued orders wait
  for the EA, and `start-bridge.ps1` reconciles terminals on every bridge start.
