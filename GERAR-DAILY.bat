@echo off
setlocal EnableExtensions
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

call :check_ollama
if not errorlevel 1 goto :ollama_ready

echo Iniciando Ollama...
start "Ollama" /min cmd /c "ollama serve"
echo Aguardando o Ollama ficar pronto...
set /a attempts=0

:wait_ollama
timeout /t 2 /nobreak >nul
call :check_ollama
if not errorlevel 1 goto :ollama_ready
set /a attempts+=1
if %attempts% GEQ 15 goto :ollama_failed
goto :wait_ollama

:ollama_ready
echo Ollama pronto.

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

:check_ollama
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2 ^| Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:ollama_failed
echo.
echo O Ollama foi iniciado, mas nao respondeu em http://localhost:11434 apos 30 segundos.
echo Tente executar manualmente: ollama serve
echo.
pause
exit /b 1

:error
echo.
echo Nao foi possivel gerar o Highlords Daily.
echo Veja a mensagem de erro acima.
echo.
pause
exit /b 1
