# JoeMoney MT5 Demo Bridge

This package supports a **single MT5 demo account** on a Windows VPS. Log into the demo account manually in MT5. The Vercel PWA's `/mt5-demo` screen sends orders through a temporary HTTPS tunnel to the bridge, which queues them in local SQLite; the EA polls locally and submits them inside MT5. Broker passwords are not collected by this test flow.

## What it supports

- Market BUY/SELL and broker-held BUY_LIMIT, SELL_LIMIT, BUY_STOP, and SELL_STOP orders.
- Multiple independent positions at a ladder level: send one order object per position. The bridge preserves every item; batch limit is 100.
- Optional spot-based TP calculated from the broker quote immediately before MT5 submission: BUY uses current ask + distance; SELL uses current bid - distance. If that TP is not valid for the pending entry or violates broker stop distance, the EA rejects the order and reports the reason.
- Client/EA bearer-token separation, single configured MT5 login, command state, and execution acknowledgements.

This is a private demo test path, not production-ready multi-user infrastructure. Do not use a live account. The demo token is entered at runtime in the PWA and is not compiled into its bundle, but it is still a shared bearer secret: only provide it to trusted testers and rotate it after testing. The bridge must remain bound to `127.0.0.1`; the tunnel provides the HTTPS public edge.

If you need each filled same-symbol trade to remain a separately visible position, the MT5 demo account must use **hedging** mode. On a netting account, MT5 can combine same-symbol fills into one net position even though the bridge sent multiple separate orders.

## Windows VPS Test

Use Windows Server 2025 with MT5 installed. Copy only this `final` folder to a path such as `C:\JoeMoney\final`; do not copy the old `learn` examples. Install Python 3.10 or newer and the official Cloudflare `cloudflared.exe` binary (Cloudflare downloads: `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/`). In MT5, log into the demo account manually, make sure it is connected, and note its numeric login. Compile `JoeMoneyBridgeEA.mq5` in MetaEditor, but do not attach it yet because the bridge generates the EA token on first start.

Open an elevated firewall configuration only for RDP from your own IP. Do **not** open port `8765`. From the same Windows account that will run Python and MT5, open PowerShell in the copied folder and start the bridge:

```powershell
.\start-bridge.ps1
```

Enter the MT5 demo login when prompted. On first start the script creates distinct client and EA tokens and protects their saved copies using Windows DPAPI for that Windows user. In MT5, attach the compiled EA to a chart on the matching demo account, set its `EaToken` to the printed EA token and `BridgeUrl` to `http://127.0.0.1:8765`, enable Algo Trading, and allow that URL in MT5 WebRequest settings. Restart the EA after changing inputs.

Open a second PowerShell window in the same folder and start a temporary HTTPS tunnel:

```powershell
.\start-tunnel.ps1
```

Copy the `https://....trycloudflare.com` address printed by Cloudflare. In Vercel project settings, set the **Production** environment variable `VITE_JOEMONEY_API_URL` to that full HTTPS URL, then redeploy the PWA. For a local PWA build, set the same variable in `.env.local` before building. The bridge launcher allows browser requests only from `https://jtrade-seven.vercel.app`. If the Cloudflare Quick Tunnel restarts and produces a different URL, update the Vercel variable and redeploy.

Once the new Vercel deployment is ready, open the installed PWA and choose **Open VPS MT5 demo tester** from the splash screen (or open `/mt5-demo`). Paste the client token printed by `start-bridge.ps1`, click **Check connection**, and confirm the correct MT5 demo login is reported before submitting a tiny test order. Use the broker's exact symbol and valid volume/price. Check the resulting ticket/status in both the PWA and MT5 Trade/Experts tabs.

Keep both PowerShell windows open. The tunnel URL is temporary and should only be shared with testers. A random URL is not authentication; token validation is still required. This setup does not enroll MT5 credentials from the PWA, add per-client identities, or support several client accounts.

## Test the Bridge

Before moving it to the VPS, run the bridge unit tests locally:

```powershell
python -m unittest discover -s final -v
```

The HTTP response means “queued”, not “executed”. The PWA waits briefly for the EA acknowledgement; pending trades must still be confirmed in MT5. If the EA is offline, commands remain queued until it reconnects, so inspect the queue/account before restarting or resubmitting.

## Protocol and constraints

- `POST /v1/orders`: authenticated batch of orders; no account login can be selected by the caller.
- `GET /v1/commands/next?login=...`: EA-only poll; command is atomically claimed before being returned.
- EA poll payload is a seven-field pipe-delimited line: `id|symbol|order_type|volume|entry_price|tp_enabled|tp_distance`.
- `POST /v1/commands/{id}/result`: EA acknowledgement with `placed` or `rejected`, ticket, and message.
- `POST /v1/terminal/status` and `GET /v1/status`: terminal connection status comes from the EA's explicit MT5 connection report; bridge reachability or EA command polling alone does not mean the broker connection is up.

MetaEditor is required to compile the EA; Python tests do not compile MQL5. The Quick Tunnel is temporary testing transport only. Before production, replace the shared demo token with real JoeMoney user authentication and per-user account authorization, add encrypted per-account credential provisioning and isolated MT5 terminal sessions, add durable reconciliation for claims/acknowledgements, and implement administrative kill controls and monitoring.