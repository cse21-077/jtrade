$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$secretsDirectory = Join-Path $PSScriptRoot 'secrets'
New-Item -ItemType Directory -Force -Path $secretsDirectory | Out-Null

function Get-OrCreateProtectedToken([string]$Name) {
    $path = Join-Path $secretsDirectory "$Name.dpapi"
    if (Test-Path $path) {
        $secure = Get-Content -Raw -Path $path | ConvertTo-SecureString
    } else {
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

# --- Terminal infrastructure (seed these once on the VPS, see README) ---
$terminalsDir    = if ($env:JOEMONEY_TERMINALS_DIR)    { $env:JOEMONEY_TERMINALS_DIR }    else { 'C:\MT5Terminals\JoeMoney' }
$terminalMaster  = if ($env:JOEMONEY_TERMINAL_MASTER)  { $env:JOEMONEY_TERMINAL_MASTER }  else { '' }
$eaSource        = if ($env:JOEMONEY_EA_SOURCE)        { $env:JOEMONEY_EA_SOURCE }        else { '' }
$chartTemplate   = if ($env:JOEMONEY_CHART_TEMPLATE)   { $env:JOEMONEY_CHART_TEMPLATE }   else { '' }

New-Item -ItemType Directory -Force -Path $terminalsDir | Out-Null
if (-not $terminalMaster -or -not (Test-Path (Join-Path $terminalMaster 'terminal64.exe'))) {
    throw "JOEMONEY_TERMINAL_MASTER must point to the seeded portable MT5 folder containing terminal64.exe."
}
if (-not $eaSource -or -not (Test-Path $eaSource)) {
    throw "JOEMONEY_EA_SOURCE must point to the compiled JoeMoneyBridgeEA.ex5."
}
if (-not $chartTemplate -or -not (Test-Path $chartTemplate)) {
    Write-Warning "JOEMONEY_CHART_TEMPLATE not set; terminals launch without an auto-attached EA. Attach the EA to a chart manually in each terminal."
}

$env:JOEMONEY_TERMINALS_DIR   = $terminalsDir
$env:JOEMONEY_TERMINAL_MASTER = $terminalMaster
$env:JOEMONEY_EA_SOURCE       = $eaSource
$env:JOEMONEY_CHART_TEMPLATE  = $chartTemplate

$eaToken = Get-OrCreateProtectedToken 'ea-token'
$env:JOEMONEY_EA_TOKEN = $eaToken
$env:JOEMONEY_ALLOWED_ORIGIN = 'https://jtrade-seven.vercel.app'
$env:JOEMONEY_HOST = '127.0.0.1'
$env:JOEMONEY_PORT = '8765'
$env:JOEMONEY_DB_PATH = Join-Path $PSScriptRoot 'data\joemoney.sqlite3'
New-Item -ItemType Directory -Force -Path (Split-Path $env:JOEMONEY_DB_PATH) | Out-Null

Write-Host ''
Write-Host 'JoeMoney multi-account bridge is starting.' -ForegroundColor Green
Write-Host 'EA token (set once inside the JoeMoney.chr template inputs):' -ForegroundColor Yellow
Write-Host $eaToken
Write-Host ''

$mentorToken = & python -c "import bridge; print(bridge.ensure_default_mentor())"
Write-Host 'Mentor token (paste into the PWA MT5 screen):' -ForegroundColor Yellow
Write-Host $mentorToken
Write-Host ''
Write-Host 'Re-launching terminals for active accounts that are not running...' -ForegroundColor DarkGray
& python -c "import bridge; bridge.reconcile_on_boot()"
Write-Host ''
Write-Host 'Bridge is loopback-only at http://127.0.0.1:8765; Caddy serves it over HTTPS. Do not expose port 8765.'
Write-Host 'Keep this window open.'
Write-Host ''

& python .\bridge.py
