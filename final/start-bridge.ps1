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

$mt5Login = Read-Host 'Numeric MT5 DEMO login shown in this VPS terminal'
if ($mt5Login -notmatch '^\d{4,20}$') {
    throw 'MT5 login must be the numeric demo login shown in the terminal.'
}

$clientToken = Get-OrCreateProtectedToken 'client-token'
$eaToken = Get-OrCreateProtectedToken 'ea-token'
$env:JOEMONEY_CLIENT_TOKEN = $clientToken
$env:JOEMONEY_EA_TOKEN = $eaToken
$env:JOEMONEY_MT5_LOGIN = $mt5Login
$env:JOEMONEY_ALLOWED_ORIGIN = 'https://jtrade-seven.vercel.app'
$env:JOEMONEY_HOST = '127.0.0.1'
$env:JOEMONEY_PORT = '8765'
$env:JOEMONEY_DB_PATH = Join-Path $PSScriptRoot 'data\joemoney.sqlite3'
New-Item -ItemType Directory -Force -Path (Split-Path $env:JOEMONEY_DB_PATH) | Out-Null

Write-Host ''
Write-Host 'JoeMoney local demo bridge is starting.' -ForegroundColor Green
Write-Host 'Copy the client token into the MT5 Demo page in the PWA:' -ForegroundColor Yellow
Write-Host $clientToken
Write-Host ''
Write-Host 'Set this EA token in the JoeMoney EA inputs in MT5:' -ForegroundColor Yellow
Write-Host $eaToken
Write-Host ''
Write-Host 'Tokens are encrypted with Windows DPAPI for this Windows user.'
Write-Host 'Bridge is loopback-only at http://127.0.0.1:8765; do not expose port 8765.'
Write-Host 'Keep this window open.'
Write-Host ''

& python .\bridge.py
