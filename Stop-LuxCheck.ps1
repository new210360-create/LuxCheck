$ErrorActionPreference = 'Stop'
try { $health = Invoke-RestMethod 'http://127.0.0.1:4190/health' -TimeoutSec 2 } catch { Write-Host 'LuxCheck is not running.'; exit 0 }
if ($health.app -ne 'LuxCheck') { throw 'The listener is not LuxCheck.' }
$targetPid = [int]$health.pid
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"
$serverPath = Join-Path $PSScriptRoot 'server.cjs'
if (-not $processInfo -or -not $processInfo.CommandLine.Contains($serverPath)) { throw 'Process ownership check failed.' }
Stop-Process -Id $targetPid
Write-Host 'LuxCheck stopped.'
