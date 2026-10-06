@echo off
setlocal
cd /d "%~dp0"

echo.
echo ========================================
echo          HIGH LORDS DAILY
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node 22 ou superior.
  pause
  exit /b 1
)

where ollama >nul 2>nul
if errorlevel 1 (
  echo Ollama nao encontrado. Instale o Ollama antes de continuar.
  pause
  exit /b 1
)

powershell -NoProfile -Command "try { Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Iniciando Ollama...
  start "Ollama" /min cmd /c "ollama serve"
  timeout /t 3 /nobreak >nul
)

if not exist node_modules\yaml\package.json (
  echo Instalando ou atualizando dependencias...
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo Gerando a newsletter...
call npm.cmd run daily
if errorlevel 1 goto :error

echo.
echo Newsletter gerada com sucesso.
echo O HTML e o PDF estao dentro da pasta output.
echo.
pause
exit /b 0

:error
echo.
echo Nao foi possivel gerar o Highlords Daily.
echo Veja a mensagem de erro acima.
echo.
pause
exit /b 1
