$ErrorActionPreference = 'Stop'

$cloudflared = Join-Path $PSScriptRoot 'cloudflared.exe'
if (-not (Test-Path $cloudflared)) {
    $command = Get-Command cloudflared.exe -ErrorAction SilentlyContinue
    if ($command) {
        $cloudflared = $command.Source
    } else {
        throw 'Install cloudflared.exe from Cloudflare and place it in this folder or add it to PATH.'
    }
}

Write-Host 'Starting a temporary HTTPS tunnel to the loopback-only MT5 bridge.' -ForegroundColor Green
Write-Host 'Copy the https://*.trycloudflare.com URL printed below into the Vercel project setting:' -ForegroundColor Yellow
Write-Host 'VITE_JOEMONEY_API_URL'
Write-Host 'This Quick Tunnel URL changes when the tunnel restarts. Do not use it as a production endpoint.'
Write-Host 'Keep this window open.'
Write-Host ''

& $cloudflared tunnel --url http://127.0.0.1:8765
