<#
.SYNOPSIS
  Kills any process currently listening on the ports used by the server (4310) and client (5173) dev servers.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/free-ports.ps1
#>

param(
    [int[]]$Ports = @(4310, 5173)
)

# Single query for all ports instead of one call per port.
#
# -State Listen matters: without it the query also returns sockets in TIME_WAIT
# and the like, which are owned by PID 0 and cannot be killed by anyone. That
# produced a confident "Killing process 'Idle' (PID 0) using port(s) 4310..."
# on every run that followed a recent shutdown - a line that read like the
# script had done something when it had silently failed to. Only a listener
# actually holds a port against the next bind, and it is the only thing here
# worth killing. Matches Get-ServerProcessIds in studio.ps1.
$connections = Get-NetTCPConnection -LocalPort $Ports -State Listen -ErrorAction SilentlyContinue

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
