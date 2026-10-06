param([switch]$RefreshTerminals)

$ErrorActionPreference = 'Stop'
try {
Set-Location $PSScriptRoot

$secretsDirectory = Join-Path $env:ProgramData 'JoeMoney'
New-Item -ItemType Directory -Force -Path $secretsDirectory | Out-Null

function Get-OrCreateProtectedToken([string]$Name) {
    $path = Join-Path $secretsDirectory "$Name.dpapi"
    $legacyPath = Join-Path (Join-Path $PSScriptRoot 'secrets') "$Name.dpapi"
    if (Test-Path $path) {
        try {
            $protectedValue = (Get-Content -Raw -Path $path).Trim()
            $secure = ConvertTo-SecureString -String $protectedValue
        } catch {
            throw "Saved $Name at $path cannot be decrypted for Windows user $env:USERNAME. Start the bridge under the same Windows account that first created it; the key was not changed. Details: $($_.Exception.Message)"
        }
    } elseif (Test-Path $legacyPath) {
        try {
            $protectedValue = (Get-Content -Raw -Path $legacyPath).Trim()
            $secure = ConvertTo-SecureString -String $protectedValue
            $secure | ConvertFrom-SecureString | Set-Content -Encoding ASCII -Path $path
            Write-Host "Migrated the saved $Name to $path. Future app-folder updates will keep using this key." -ForegroundColor Green
        } catch {
            $backupPath = "$legacyPath.invalid.$(Get-Date -Format 'yyyyMMddHHmmss').bak"
            Move-Item -LiteralPath $legacyPath -Destination $backupPath
            Write-Warning "The old $Name file could not be decrypted. It was backed up to $backupPath; a new persistent key will be created once. Update the PWA key and EA chart input to match it."
        }
    }

    if (-not $secure) {
        $plain = ([guid]::NewGuid().ToString('N')) + ([guid]::NewGuid().ToString('N'))
        $secure = ConvertTo-SecureString -String $plain -AsPlainText -Force
        $secure | ConvertFrom-SecureString | Set-Content -Encoding ASCII -Path $path
    }

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

# --- Terminal infrastructure (seed once on the VPS, see README) ---
# Defaults match the runbook: master terminal at C:\MT5Terminals\JoeMoneyMaster.
# Override any of them with environment variables before running this script.
$terminalsDir    = if ($env:JOEMONEY_TERMINALS_DIR)    { $env:JOEMONEY_TERMINALS_DIR }    else { 'C:\MT5Terminals\JoeMoney' }
$terminalMaster  = if ($env:JOEMONEY_TERMINAL_MASTER)  { $env:JOEMONEY_TERMINAL_MASTER }  else { 'C:\MT5Terminals\JoeMoneyMaster' }
$eaSource        = if ($env:JOEMONEY_EA_SOURCE)        { $env:JOEMONEY_EA_SOURCE }        else { 'C:\MT5Terminals\JoeMoneyMaster\MQL5\Experts\JoeMoneyBridgeEA.ex5' }
$chartTemplate   = if ($env:JOEMONEY_CHART_TEMPLATE)   { $env:JOEMONEY_CHART_TEMPLATE }   else { 'C:\MT5Terminals\JoeMoneyMaster\MQL5\Profiles\Charts\JoeMoney\chart01.chr' }

New-Item -ItemType Directory -Force -Path $terminalsDir | Out-Null
if (-not (Test-Path (Join-Path $terminalMaster 'terminal64.exe'))) {
    throw "Master terminal not found at $terminalMaster. Seed it per README section C (copy the MT5 install there and run terminal64.exe /portable once)."
}
if (-not (Test-Path $eaSource)) {
    throw "Compiled EA not found at $eaSource. Copy JoeMoneyBridgeEA.mq5 into the master terminal's MQL5\Experts and compile with F7 in MetaEditor."
}
if (-not (Test-Path $chartTemplate)) {
    Write-Warning "Chart template not found at $chartTemplate. Terminals launch without an auto-attached EA; attach the EA to a chart manually in each terminal (README step 8)."
}

$env:JOEMONEY_TERMINALS_DIR   = $terminalsDir
$env:JOEMONEY_TERMINAL_MASTER = $terminalMaster
$env:JOEMONEY_EA_SOURCE       = $eaSource
$env:JOEMONEY_CHART_TEMPLATE  = $chartTemplate

# One shared key protects the bridge and EA. It is created once, DPAPI-protected
# for this Windows user, and stored outside the app folder for reuse after updates.
$bridgeKey = Get-OrCreateProtectedToken 'bridge-key'
$env:JOEMONEY_BRIDGE_KEY = $bridgeKey
$env:JOEMONEY_EA_TOKEN = $bridgeKey
$env:JOEMONEY_ALLOWED_ORIGIN = 'https://jtrade-seven.vercel.app'
$env:JOEMONEY_HOST = '127.0.0.1'
$env:JOEMONEY_PORT = '8765'
$env:JOEMONEY_DB_PATH = Join-Path $PSScriptRoot 'data\joemoney.sqlite3'
New-Item -ItemType Directory -Force -Path (Split-Path $env:JOEMONEY_DB_PATH) | Out-Null

Write-Host ''
Write-Host 'JoeMoney bridge is starting.' -ForegroundColor Green
Write-Host 'Bridge key (bake into the PWA as VITE_JOEMONEY_BRIDGE_KEY in Vercel; the EA carries the same token compiled in — if you ever change this key, update EaToken in JoeMoneyBridgeEA.mq5 and recompile with F7):' -ForegroundColor Yellow
Write-Host $bridgeKey
Write-Host ''
Write-Host 'Re-launching terminals for active accounts that are not running...' -ForegroundColor DarkGray
if ($RefreshTerminals) {
    Write-Warning 'Refresh requested: all terminal64.exe processes under the managed JoeMoney slots directory will be closed, refreshed from the master EA/chart files, and restarted. Positions already held by the broker remain open, but monitoring is interrupted briefly.'
}
$refreshValue = if ($RefreshTerminals) { 'True' } else { 'False' }
& python -c "import bridge; bridge.reconcile_on_boot(force_refresh=$refreshValue)"
if ($LASTEXITCODE -ne 0) {
    throw "Terminal reconciliation failed with exit code $LASTEXITCODE. Check that Python is installed and available as 'python'."
}
Write-Host ''
Write-Host 'Bridge is loopback-only at http://127.0.0.1:8765; Caddy serves it over HTTPS. Do not expose port 8765.'
Write-Host 'Keep this window open.'
Write-Host ''

& python .\bridge.py
if ($LASTEXITCODE -ne 0) {
    throw "Bridge exited with code $LASTEXITCODE."
}
} catch {
    Write-Host ''
    Write-Host 'Bridge startup failed:' -ForegroundColor Red
    Write-Host ($_ | Out-String) -ForegroundColor Red
    Read-Host 'Press Enter to close this window'
    exit 1
}
