param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$url = 'http://127.0.0.1:4190'
function Read-LuxHealth {
    try { return Invoke-RestMethod "$url/health" -TimeoutSec 2 } catch { return $null }
}
$health = Read-LuxHealth
if (-not $health) {
    if (Get-NetTCPConnection -LocalPort 4190 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 4190 is occupied by another application.' }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Users\AR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js runtime was not found.' }
    $serverPath = Join-Path $PSScriptRoot 'server.cjs'
    $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'server-error.log') -PassThru
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 300
        $health = Read-LuxHealth
        if ($health) { break }
        if ($process.HasExited) { throw 'LuxCheck failed to start. Check server-error.log.' }
    }
}
if (-not $health -or $health.app -ne 'LuxCheck') { throw 'LuxCheck health check failed.' }
Write-Host "LuxCheck is running: $url/"
if (-not $NoBrowser) { Start-Process "$url/" }
