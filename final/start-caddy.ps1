$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$caddy = 'C:\Caddy\caddy.exe'
if (-not (Test-Path $caddy)) {
    $caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source
}
if (-not $caddy) {
    throw "caddy.exe not found. Download it from https://caddyserver.com/download and place it at C:\Caddy\caddy.exe, or add it to PATH."
}

& $caddy run --config (Join-Path $PSScriptRoot 'Caddyfile')
