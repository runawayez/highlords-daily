@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RUN-DAILY.ps1"
set "exitCode=%errorlevel%"

echo.
if not "%exitCode%"=="0" (
  echo Nao foi possivel gerar o Highlords Daily.
  echo O erro detalhado esta logo acima.
  echo.
)

pause
exit /b %exitCode%
