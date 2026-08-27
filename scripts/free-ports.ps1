<#
.SYNOPSIS
  Kills any process currently listening on the ports used by the server (4310) and client (5179) dev servers.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/free-ports.ps1
#>

param(
    [int[]]$Ports = @(4310, 5173)
)

# Single query for all ports instead of one call per port.
$connections = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue

foreach ($port in $Ports) {
    if (-not ($connections | Where-Object LocalPort -eq $port)) {
        Write-Host "Port $port is free."
    }
}

if (-not $connections) {
    Write-Host "Done."
    return
}

# Dedupe PIDs so a process holding multiple ports is only killed once.
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $processIds) {
    $ownedPorts = ($connections | Where-Object OwningProcess -eq $processId | Select-Object -ExpandProperty LocalPort -Unique) -join ", "
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { "unknown" }
    Write-Host "Killing process '$name' (PID $processId) using port(s) $ownedPorts..."
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Write-Host "Done."
