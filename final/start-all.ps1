param([switch]$OpenMaster)

$ErrorActionPreference = 'Stop'

$masterDirectory = if ($env:JOEMONEY_TERMINAL_MASTER) {
    $env:JOEMONEY_TERMINAL_MASTER
} else {
    'C:\MT5Terminals\JoeMoneyMaster'
}
$masterExecutable = Join-Path $masterDirectory 'terminal64.exe'
$shellExecutable = (Get-Process -Id $PID).Path

function Start-ScriptWindow([string]$ScriptName) {
    $scriptPath = Join-Path $PSScriptRoot $ScriptName
    if (-not (Test-Path $scriptPath)) {
        throw "Required script not found: $scriptPath"
    }

    $arguments = '-NoExit -ExecutionPolicy Bypass -File "{0}"' -f $scriptPath
    Start-Process -FilePath $shellExecutable -ArgumentList $arguments -WorkingDirectory $PSScriptRoot
    Write-Host "Started $ScriptName in a separate PowerShell window."
}

Start-ScriptWindow 'start-caddy.ps1'
Start-ScriptWindow 'start-bridge.ps1'

if ($OpenMaster) {
    if (-not (Test-Path $masterExecutable)) {
        throw "Master terminal not found: $masterExecutable"
    }

    Start-Process -FilePath $masterExecutable -ArgumentList '/portable' -WorkingDirectory $masterDirectory
    Write-Host 'Started the master MT5 terminal in portable mode.' -ForegroundColor Green
    Write-Host 'Use the bridge key printed in the bridge window when configuring the EA.'
    Write-Host 'Close the master after saving the chart template so it does not poll alongside account terminals.'
}

Write-Host ''
Write-Host 'The bridge starts portable slot terminals for active registered accounts.'
Write-Host 'Keep the Caddy and bridge PowerShell windows open.'