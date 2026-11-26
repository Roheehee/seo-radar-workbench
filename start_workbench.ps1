param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$radarUrl = 'http://127.0.0.1:8765'
$radarReady = $false
try {
    $radarHealth = Invoke-RestMethod -Uri "$radarUrl/api/health" -TimeoutSec 2
    $radarReady = $radarHealth.app -eq 'new-term-radar-workbench'
} catch {}
if (-not $radarReady) {
    $radarPython = (Get-Command python -ErrorAction Stop).Source
    $radarScript = Join-Path $PSScriptRoot 'workbench_server.py'
    $radarState = Join-Path $PSScriptRoot 'state'
    New-Item -ItemType Directory -Force -Path $radarState | Out-Null
    Start-Process -FilePath $radarPython -ArgumentList @('-X', 'utf8', ('"' + $radarScript + '"'), '--no-open') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $radarState 'workbench-server.log') -RedirectStandardError (Join-Path $radarState 'workbench-server-error.log') | Out-Null
    for ($radarAttempt = 0; $radarAttempt -lt 20; $radarAttempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $radarHealth = Invoke-RestMethod -Uri "$radarUrl/api/health" -TimeoutSec 1
            if ($radarHealth.app -eq 'new-term-radar-workbench') { $radarReady = $true; break }
        } catch {}
    }
}
if (-not $radarReady) { throw 'Workbench did not start. Check state/workbench-server-error.log.' }
if (-not $NoOpen) { Start-Process $radarUrl }
Write-Output $radarUrl
