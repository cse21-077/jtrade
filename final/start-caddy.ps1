$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$caddy = 'C:\Caddy\caddy.exe'
if (-not (Test-Path $caddy)) {
    $caddy = Join-Path $PSScriptRoot 'caddy.exe'
}
if (-not (Test-Path $caddy)) {
    $caddy = (Get-Command caddy -ErrorAction SilentlyContinue).Source
}
if (-not $caddy) {
    throw "caddy.exe not found. Download the Windows executable from https://caddyserver.com/download and place it beside start-caddy.ps1, at C:\Caddy\caddy.exe, or add it to PATH."
}

& $caddy run --config (Join-Path $PSScriptRoot 'Caddyfile')
