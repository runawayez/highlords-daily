@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-DAILY.ps1" --setup-only
set "exitCode=%errorlevel%"
echo.
pause
exit /b %exitCode%
