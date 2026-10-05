# JoeMoney Multi-Account MT5 Bridge

This package runs the MT5 execution side of the JoeMoney PWA on a Windows VPS
(178.238.234.68). Mentors register MT5 accounts (login/password/server) from the
PWA's MT5 screen; the bridge stores them in a local SQLite database, starts one
portable MT5 terminal per account (auto-login via `startup.ini`, EA pre-attached via
a chart profile), and routes the mentor's order batches to the right terminal. The
JoeMoney EA inside each terminal polls the bridge over loopback HTTP and submits
orders inside MT5.

## What it supports

- Many MT5 accounts, each in its own portable terminal under `C:\MT5Terminals\JoeMoney\SlotNNN`.
- Per-mentor bearer tokens: a mentor can only see, trade, and deactivate accounts registered with their token.
- Market BUY/SELL and broker-held BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP orders; one order object per position, up to 100 per batch, idempotent submission via `Idempotency-Key`.
- Optional spot-based TP from the broker quote at execution time (BUY: ask + distance; SELL: bid - distance).
- Terminal supervision: terminals are launched on registration, re-launched when orders arrive for a stopped terminal, and reconciled on bridge start (pre-warm on boot).
- Explicit per-account connection status from the EA heartbeat — bridge or EA polling alone does not mean the broker connection is up.

## One-time VPS setup (Windows Server, MT5 installed)

1. **Seed the master terminal.** Create one clean portable MT5 folder (e.g.
   `C:\MT5Terminals\JoeMoneyMaster`) with `terminal64.exe`, log in once so all
   broker servers are cached, then log out. Set `JOEMONEY_TERMINAL_MASTER` to it.
   New slots are cloned from this master.
2. **Compile the EA.** Compile `JoeMoneyBridgeEA.mq5` in MetaEditor and set
   `JOEMONEY_EA_SOURCE` to the resulting `.ex5`.
3. **Create the chart template.** Start the master terminal, attach the compiled EA
   to a chart with `BridgeUrl=http://127.0.0.1:8765` and the EA token you will use
   (printed by `start-bridge.ps1`), enable Algo Trading, allow the URL in MT5
   WebRequest settings, then save the chart profile: Charts > Save As, name it
   `JoeMoney`, saved under `MQL5\Profiles\Charts\Default\JoeMoney.chr`. Set
   `JOEMONEY_CHART_TEMPLATE` to that file. Every launched terminal opens this chart
   with the EA already running. Until this file exists, terminals still launch and
   log in, but the EA must be attached manually per terminal.
4. **DNS + Caddy.** Point a domain (or free DuckDNS subdomain) A record at
   178.238.234.68 — Let's Encrypt does not issue certificates for bare IPs. Put the
   hostname in `Caddyfile` and run Caddy on the VPS. Firewall: allow 443 (and RDP
   from your admin IP only); port 8765 must stay loopback.
5. **PWA env.** Set `VITE_JOEMONEY_API_URL=https://bridge.<your-domain>` in Vercel
   Production environment variables and redeploy.

## Run

```powershell
.\start-bridge.ps1
```

The script loads/creates the DPAPI-protected EA token, prints the **mentor token**
(paste it into the PWA MT5 screen) and the EA token (bake into `JoeMoney.chr`),
re-launches any stopped terminals for active accounts, then starts the bridge at
`http://127.0.0.1:8765` behind Caddy. Keep the window open.

## Test the bridge

Before moving it to the VPS, run the unit tests locally (terminal launching and
process detection are mocked):

```powershell
python -m unittest discover -s final -v
```

## PWA flow

Open the installed PWA → **Open VPS MT5 accounts** (or `/mt5`) → paste the mentor
token → **Check connection** → register an account (MT5 login, password, server).
The VPS launches and logs in a terminal for it; the account list shows green when
the terminal is up and the EA heartbeat is live. Select an account, build the order
ladder, and queue. The PWA polls each order until the EA acknowledges it. A queued
response means "accepted by the bridge", not "executed" — confirm trades in MT5.

## Protocol

- `POST /v1/accounts` (mentor): `{login, password, server}` → provision/update account and launch its terminal. Passwords are stored in the local SQLite database (plaintext, per deployment decision) and are never returned.
- `GET /v1/accounts` (mentor): account list with terminal/EA status, no secrets.
- `POST /v1/accounts/{login}/deactivate` (mentor): stops trading for that account.
- `POST /v1/orders` (mentor): `{login, orders:[...]}` with `Idempotency-Key`.
- `GET /v1/orders/{id}` (mentor): order status, scoped to the owning mentor.
- `GET /v1/commands/next?login=...` (EA): atomically claims the oldest queued command for that login; payload is the 7-field pipe-delimited line `id|symbol|order_type|volume|entry_price|tp_enabled|tp_distance`.
- `POST /v1/commands/{id}/result` (EA): `placed`/`rejected` acknowledgement with ticket and message.
- `POST /v1/terminal/status` (EA): per-login connection heartbeat; `GET /v1/status?login=` (mentor) reads it.

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
