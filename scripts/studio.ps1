<#
.SYNOPSIS
  One-command local launcher: builds the client if it's stale, starts the API
  server in the background if it isn't already up, and opens the app.

.DESCRIPTION
  `npm run dev` is for editing the code. This is for *using* the tool: the
  server already serves client/dist on its own port (see server/src/index.js),
  so the whole app is one background process and one URL. Running this when the
  server is already up just opens the browser - it is safe to double-click the
  shortcut as often as you like.

  Unlike `npm start`, this never runs scripts/free-ports.ps1: killing whatever
  holds the port is the right move for a dev restart, but the wrong one for a
  launcher that should attach to the session you already have open.

.PARAMETER Command
  start      (default) Build if needed, start if needed, open the browser.
             Also starts a watcher that rebuilds client/dist whenever client
             code changes, and reloads any page you have open.
  stop       Stop the background server and the watcher. Leaves the port alone
             if whatever holds it doesn't answer /api/health - see -Force.
  restart    Stop, rebuild if needed, start again.
  status     Report whether the server and watcher are up, and on which port.
  install    Register a logon task so the server is always running, and put a
             shortcut on the Desktop.
  uninstall  Remove the logon task and the shortcut.

.PARAMETER NoBrowser
  Start the server but don't open a browser window (used by the logon task).

.PARAMETER NoWatch
  Don't run the rebuild watcher. The build is then whatever was last built,
  and `restart` is how you pick up a code change.

.PARAMETER Rebuild
  Force a full `npm run build` (including the tsc pass the watcher skips).

.PARAMETER Force
  For `stop` and `restart`: kill whatever is listening on the port even though
  it did not answer /api/health. Needed when the server is wedged badly enough
  that it can't reply - and the reason stopping is not automatic is that from
  outside, that is indistinguishable from another program having taken the
  port.

.EXAMPLE
  .\Studio.cmd
  .\Studio.cmd status
  .\Studio.cmd install
  .\Studio.cmd stop -Force
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status', 'install', 'uninstall')]
    [string]$Command = 'start',

    [switch]$NoBrowser,
    [switch]$NoWatch,
    [switch]$Rebuild,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$ScriptPath = Join-Path $Root 'scripts\studio.ps1'
$TaskName = 'Apigee Proxy Studio'
$ShortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Apigee Proxy Studio.lnk'
$StartupShortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Apigee Proxy Studio.lnk'

# Has to resolve the port to exactly what server/src/index.js will bind, or the
# launcher probes one port, finds nothing, and starts a second server on
# another — which then dies on EADDRINUSE and reports "the server exited
# immediately". Two things that used to break that:
#
#   - It also read server\.env. Nothing loads that file: the server's
#     `dotenv/config` resolves .env against the working directory, which is
#     always the repo root. Only the root .env is real.
#   - The shell lost to .env here and won over it in dotenv, so a one-off
#     `$env:API_PORT=9999` sent the two to different ports. The shell wins in
#     both places now, which is dotenv's rule and the one people expect.
function Get-ApiPort {
    if ($env:API_PORT) { return [int]$env:API_PORT }
    if ($env:PORT) { return [int]$env:PORT }
    $envFile = Join-Path $Root '.env'
    if (Test-Path $envFile) {
        $match = Select-String -Path $envFile -Pattern '^\s*API_PORT\s*=\s*(\d+)\s*$' | Select-Object -First 1
        if ($match) { return [int]$match.Matches[0].Groups[1].Value }
    }
    return 4310
}

# /api/health rather than "is the port open": it confirms this app answered,
# not just that something is listening on 4310.
function Test-StudioUp {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

# /api/build-id only exists when the server was started with STUDIO_WATCH=1, so
# asking for it is how we tell whether a server someone else started (or one
# from before this feature) will reload an open page.
function Test-WatchEndpoint {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/build-id" -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-BuildStale {
    $index = Join-Path $Root 'client\dist\index.html'
    if (-not (Test-Path $index)) { return $true }
    $builtAt = (Get-Item $index).LastWriteTimeUtc

    $sources = @()
    $srcDir = Join-Path $Root 'client\src'
    if (Test-Path $srcDir) { $sources += Get-ChildItem -Path $srcDir -Recurse -File }
    foreach ($relative in @('client\index.html', 'client\vite.config.ts', 'client\package.json', 'client\tsconfig.json')) {
        $path = Join-Path $Root $relative
        if (Test-Path $path) { $sources += Get-Item $path }
    }
    if (-not $sources) { return $false }

    # Sort rather than Measure-Object -Maximum: Windows PowerShell 5.1 only
    # takes -Maximum over numeric properties, not timestamps.
    $newest = ($sources | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc
    return $newest -gt $builtAt
}

function Invoke-Build {
    Push-Location $Root
    try {
        if (-not (Test-Path (Join-Path $Root 'node_modules'))) {
            Write-Host 'Installing dependencies (first run)...'
            & cmd.exe /c 'npm install'
            if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)." }
        }

        Write-Host 'Building the UI...'
        & cmd.exe /c 'npm run build'
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed (exit $LASTEXITCODE)." }
    }
    finally { Pop-Location }
}

function Get-ServerProcessIds {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
}

# Kept out of Start-Studio so a restart can build *before* it stops the
# running server: a stale build otherwise means a minute of downtime between
# the two.
function Invoke-BuildIfStale {
    # With the watcher on, `vite build --watch` does a full build the moment it
    # starts, so the only build worth doing up front is the one that has to
    # exist before the server boots: server/src/index.js decides whether to
    # mount client/dist at startup, once.
    if ($NoWatch) {
        if ($Rebuild -or (Test-BuildStale)) { Invoke-Build } else { Write-Host 'UI build is current.' }
    }
    elseif ($Rebuild -or -not (Test-Path (Join-Path $Root 'client\dist\index.html'))) {
        Invoke-Build
    }
}

# The watcher holds no port, so it can't be found the way the server can.
function Get-WatcherProcess {
    $pidFile = Join-Path $Root 'server\logs\watcher.pid'
    if (-not (Test-Path $pidFile)) { return $null }
    $watcherPid = (Get-Content -Path $pidFile -TotalCount 1).Trim()
    if (-not $watcherPid) { return $null }
    $process = Get-Process -Id ([int]$watcherPid) -ErrorAction SilentlyContinue
    # Names have to match, or a recycled PID would make us kill a stranger.
    if ($process -and $process.ProcessName -eq 'node') { return $process }
    return $null
}

# Vite empties client/dist before the watcher's first build, so for the couple
# of seconds that build takes the server has nothing to serve: `/` and every
# hashed asset 404 or 500. Waiting for index.html to be rewritten is what keeps
# a browser opened right after the launcher returns out of that window. A page
# that was already open rides it out on its own (see the reload poller in
# server/src/index.js, which holds its last known id while the id is null).
function Wait-ForBuild {
    param([datetime]$Since, [int]$TimeoutSeconds = 90)
    $index = Join-Path $Root 'client\dist\index.html'
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $item = Get-Item -Path $index -ErrorAction SilentlyContinue
        if ($item -and $item.LastWriteTimeUtc -gt $Since) { return $true }
        Start-Sleep -Milliseconds 200
    }
    return $false
}

function Start-Watcher {
    $logDir = Join-Path $Root 'server\logs'
    $watchLog = Join-Path $logDir 'watcher.out.log'
    $watchErrLog = Join-Path $logDir 'watcher.err.log'

    Write-Host 'Starting the UI watcher (rebuilds client/dist on change)...'
    # Taken before the process starts, so a build that lands unusually fast is
    # still newer than this and not missed.
    $since = (Get-Date).ToUniversalTime()
    # `vite build --watch` rather than `npm run build`: it rebuilds only what
    # changed, in about a second. It also skips the `tsc -b` pass that
    # `npm run build` does, so a type error shows up as a red squiggle in the
    # editor and at the next full build, not here.
    $process = Start-Process -FilePath 'node' `
        -ArgumentList 'node_modules/vite/bin/vite.js', 'build', 'client', '--watch' `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $watchLog `
        -RedirectStandardError $watchErrLog `
        -PassThru

    Set-Content -Path (Join-Path $logDir 'watcher.pid') -Value $process.Id

    Write-Host 'Waiting for the first watch build...'
    if (-not (Wait-ForBuild -Since $since)) {
        # A warning, not a failure: the server is up either way, and the next
        # successful rebuild reloads whatever page is open.
        Write-Warning "The watcher has not produced a build yet - client/dist may be mid-rebuild. See $watchErrLog."
    }
}

function Stop-Watcher {
    $process = Get-WatcherProcess
    if ($process) {
        Write-Host "Stopping the UI watcher (PID $($process.Id))..."
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    $pidFile = Join-Path $Root 'server\logs\watcher.pid'
    if (Test-Path $pidFile) { Remove-Item -Path $pidFile -Force }
}

function Start-Studio {
    param([int]$Port)

    $logDir = Join-Path $Root 'server\logs'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    # Only the launcher's own view of stdout/stderr - the app's structured log
    # is still server/logs/studio.log (npm run logs).
    $outLog = Join-Path $logDir 'launcher.out.log'
    $errLog = Join-Path $logDir 'launcher.err.log'

    Write-Host "Starting the server on port $Port..."
    # STUDIO_WATCH tells the server to add a reload poller to index.html, so a
    # page you already have open picks the rebuild up by itself. Scoped to this
    # child process: a `npm start` in another window is unaffected.
    #
    # LOG_TO_CONSOLE=0 for the same reason the redirect exists at all: nothing
    # reads this process's stdout. Left on, the console sink wrote every line
    # a second time into launcher.out.log - the same NDJSON studio.log gets,
    # but with none of the 5mb x 5 rotation studio.log has, so under the logon
    # task it grew without bound between logons. studio.log keeps strictly more
    # (it is at debug, the console was at info). The startup banner is a plain
    # console.log and still lands here, and stderr is untouched, so the crash
    # path below still has something to print.
    $previousWatchFlag = $env:STUDIO_WATCH
    $previousConsoleFlag = $env:LOG_TO_CONSOLE
    if (-not $NoWatch) { $env:STUDIO_WATCH = '1' } else { $env:STUDIO_WATCH = $null }
    $env:LOG_TO_CONSOLE = '0'
    try {
        $process = Start-Process -FilePath 'node' `
            -ArgumentList 'server/src/index.js' `
            -WorkingDirectory $Root `
            -WindowStyle Hidden `
            -RedirectStandardOutput $outLog `
            -RedirectStandardError $errLog `
            -PassThru
    }
    finally {
        $env:STUDIO_WATCH = $previousWatchFlag
        $env:LOG_TO_CONSOLE = $previousConsoleFlag
    }

    for ($i = 0; $i -lt 60; $i++) {
        if (Test-StudioUp -Port $Port) {
            if (-not $NoWatch) {
                Stop-Watcher
                Start-Watcher
            }
            return $true
        }
        if ($process.HasExited) {
            Write-Warning "The server exited immediately (code $($process.ExitCode))."
            # Two files, because a startup failure lands in one or the other:
            # a module that fails to load, or the EADDRINUSE message, is written
            # straight to stderr; anything that reaches the crash handler is
            # logged instead, and with the console sink off that only exists in
            # studio.log.
            foreach ($file in @($errLog, $outLog, (Join-Path $logDir 'studio.log'))) {
                if ((Test-Path $file) -and (Get-Item $file).Length -gt 0) {
                    Write-Host "--- last lines of $file ---"
                    Get-Content -Path $file -Tail 20 | Write-Host
                }
            }
            return $false
        }
        Start-Sleep -Milliseconds 500
    }

    Write-Warning "The server did not answer /api/health within 30s. See $errLog and server/logs/studio.log."
    return $false
}

# Confirms the port is really this app before killing what holds it.
# Get-ServerProcessIds only establishes that *something* listens on 4310, and
# 4310 is not reserved for us — on a machine where another service has taken
# it, `Studio.cmd stop` used to kill a stranger without a word. /api/health is
# the same proof `status` already relies on to tell "up" from "something is on
# that port".
#
# The awkward case is our own server wedged badly enough that it cannot answer:
# from out here that looks identical to a stranger. So rather than guess, name
# what is holding the port and let the caller decide — `stop` is exactly when
# you need that to be your call, not the script's.
function Stop-Studio {
    param([int]$Port)
    Stop-Watcher
    $processIds = Get-ServerProcessIds -Port $Port
    if (-not $processIds) {
        Write-Host "Nothing is listening on port $Port."
        return
    }

    if (-not $Force -and -not (Test-StudioUp -Port $Port)) {
        foreach ($processId in $processIds) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            $name = if ($process) { $process.ProcessName } else { 'unknown' }
            Write-Warning "'$name' (PID $processId) holds port $Port but does not answer /api/health, so it may not be this app."
        }
        Write-Host "Nothing stopped. Re-run with -Force to kill it anyway, or change API_PORT in .env."
        return
    }

    foreach ($processId in $processIds) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $name = if ($process) { $process.ProcessName } else { 'unknown' }
        Write-Host "Stopping '$name' (PID $processId) on port $Port..."
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

# Targets powershell.exe directly rather than Studio.cmd: a .cmd shortcut
# flashes a console window every time, which is the wrong impression for
# something that runs at logon.
function New-StudioShortcut {
    param([string]$Path, [string]$Extra = '')
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" start$Extra"
    $shortcut.WorkingDirectory = $Root
    $shortcut.Description = 'Open Apigee Proxy Studio'
    $shortcut.Save()
}

function Install-Autostart {
    param([int]$Port)

    # `install -NoWatch` registers a logon task that only serves the last build,
    # for when you want the app around but not a watcher in memory all day.
    $watchFlag = if ($NoWatch) { ' -NoWatch' } else { '' }
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" start -NoBrowser$watchFlag"
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $Root
    # Scoped to this account, not left as an any-user trigger: registering a
    # task that fires for every user on the machine needs elevation, and this
    # is a tool for one person's checkout.
    $currentUser = "$env:USERDOMAIN\$env:USERNAME"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    # StartWhenAvailable and no time limit: this is a long-lived local service,
    # not a job the scheduler should ever decide has run too long.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit ([TimeSpan]::Zero)

    try {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
            -User $currentUser -RunLevel Limited `
            -Description 'Runs Apigee Proxy Studio in the background so its local URL is always ready.' -Force | Out-Null
        Write-Host "Registered the logon task '$TaskName'."
        if (Test-Path $StartupShortcutPath) { Remove-Item -Path $StartupShortcutPath -Force }
    }
    catch {
        # Some machines lock down the scheduler for non-admins entirely. The
        # Startup folder needs no rights at all and fires at the same moment,
        # so fall back rather than asking for elevation for a local dev tool.
        Write-Host "Task Scheduler refused the registration ($($_.Exception.Message.Trim()))."
        Write-Host 'Falling back to a Startup-folder shortcut, which needs no admin rights.'
        New-StudioShortcut -Path $StartupShortcutPath -Extra ' -NoBrowser'
        Write-Host "Added: $StartupShortcutPath"
    }

    New-StudioShortcut -Path $ShortcutPath
    Write-Host "Put a shortcut on the Desktop: $ShortcutPath"
    Write-Host "Bookmark http://127.0.0.1:$Port - after the next logon it is already up."
}

function Uninstall-Autostart {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Removed the logon task '$TaskName'."
    }
    else {
        Write-Host "No logon task named '$TaskName'."
    }
    if (Test-Path $StartupShortcutPath) {
        Remove-Item -Path $StartupShortcutPath -Force
        Write-Host 'Removed the Startup-folder shortcut.'
    }
    if (Test-Path $ShortcutPath) {
        Remove-Item -Path $ShortcutPath -Force
        Write-Host 'Removed the Desktop shortcut.'
    }
}

$port = Get-ApiPort
$url = "http://127.0.0.1:$port"

switch ($Command) {
    'status' {
        if (Test-StudioUp -Port $port) {
            $processIds = (Get-ServerProcessIds -Port $port) -join ', '
            Write-Host "Up at $url (PID $processIds)."
        }
        else {
            Write-Host "Not running (nothing answering at $url/api/health)."
        }
        $watcher = Get-WatcherProcess
        if ($watcher) {
            Write-Host "UI watcher running (PID $($watcher.Id)); client/dist rebuilds on change."
        }
        else {
            Write-Host 'UI watcher not running; client/dist is whatever was last built.'
        }
    }
    'stop' { Stop-Studio -Port $port }
    'restart' {
        Invoke-BuildIfStale
        Stop-Studio -Port $port
        Start-Sleep -Milliseconds 500
        if ((Start-Studio -Port $port) -and -not $NoBrowser) { Start-Process $url }
    }
    'install' {
        Install-Autostart -Port $port
        if (-not (Test-StudioUp -Port $port)) {
            Invoke-BuildIfStale
            if ((Start-Studio -Port $port) -and -not $NoBrowser) { Start-Process $url }
        }
    }
    'uninstall' { Uninstall-Autostart }
    default {
        if (Test-StudioUp -Port $port) {
            Write-Host "Already running at $url."
            if ($NoWatch) {
                if ($Rebuild -or (Test-BuildStale)) {
                    Write-Warning 'The UI build is out of date. Run ".\Studio.cmd restart" to rebuild and reload.'
                }
            }
            else {
                if (-not (Get-WatcherProcess)) { Start-Watcher }
                if (-not (Test-WatchEndpoint -Port $port)) {
                    Write-Warning 'The running server was started without watch mode, so an open page will not reload itself. Run ".\Studio.cmd restart" once to enable it.'
                }
            }
        }
        else {
            Invoke-BuildIfStale
            if (-not (Start-Studio -Port $port)) { exit 1 }
        }
        if (-not $NoBrowser) { Start-Process $url }
    }
}
