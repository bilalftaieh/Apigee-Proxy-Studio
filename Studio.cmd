@echo off
rem One-click launcher. Double-click it, or pass a command:
rem   Studio.cmd            start (build if stale) and open the browser
rem   Studio.cmd status|stop|restart
rem   Studio.cmd install    run at logon + Desktop shortcut
rem   Studio.cmd uninstall  undo install
rem See scripts\studio.ps1 for the details.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\studio.ps1" %*
