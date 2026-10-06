$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host $Message -ForegroundColor Cyan
}

function Get-OllamaEndpoints {
  $endpoints = New-Object System.Collections.Generic.List[string]

  if ($env:OLLAMA_HOST) {
    $hostValue = $env:OLLAMA_HOST.Trim().TrimEnd('/')
    if ($hostValue -notmatch '^https?://') {
      $hostValue = "http://$hostValue"
    }
    $endpoints.Add($hostValue)
  }

  $endpoints.Add('http://127.0.0.1:11434')
  $endpoints.Add('http://localhost:11434')
  return $endpoints | Select-Object -Unique
}

function Test-Ollama {
  foreach ($endpoint in Get-OllamaEndpoints) {
    try {
      Invoke-RestMethod "$endpoint/api/tags" -TimeoutSec 2 | Out-Null
      return $endpoint
    } catch {}
  }
  return $null
}

Write-Host ''
Write-Host '========================================' -ForegroundColor DarkGray
Write-Host '         HIGH LORDS DAILY' -ForegroundColor White
Write-Host '========================================' -ForegroundColor DarkGray
Write-Host ''

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js nao encontrado. Instale o Node 22 ou superior.'
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  throw 'npm.cmd nao encontrado no PATH.'
}

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  throw 'Ollama nao encontrado. Instale o Ollama antes de continuar.'
}

$endpoint = Test-Ollama
if (-not $endpoint) {
  Write-Step 'Iniciando Ollama...'

  $logDir = Join-Path $env:TEMP 'highlords-daily'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stdoutLog = Join-Path $logDir 'ollama-stdout.log'
  $stderrLog = Join-Path $logDir 'ollama-stderr.log'
  Remove-Item $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

  try {
    $ollamaProcess = Start-Process \
      -FilePath $ollama.Source \
      -ArgumentList 'serve' \
      -WindowStyle Hidden \
      -RedirectStandardOutput $stdoutLog \
      -RedirectStandardError $stderrLog \
      -PassThru
  } catch {
    throw "Falha ao iniciar o Ollama: $($_.Exception.Message)"
  }

  Write-Step 'Aguardando a API do Ollama...'
  for ($second = 1; $second -le 30; $second++) {
    Start-Sleep -Seconds 1
    $endpoint = Test-Ollama
    if ($endpoint) { break }

    if ($ollamaProcess.HasExited) {
      $details = ''
      if (Test-Path $stderrLog) {
        $details = (Get-Content $stderrLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n"
      }
      if (-not $details -and (Test-Path $stdoutLog)) {
        $details = (Get-Content $stdoutLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n"
      }
      throw "O processo 'ollama serve' encerrou antes de abrir a API.`n$details"
    }
  }

  if (-not $endpoint) {
    $details = ''
    if (Test-Path $stderrLog) {
      $details = (Get-Content $stderrLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n"
    }
    throw "Ollama nao respondeu apos 30 segundos. Log: $stderrLog`n$details"
  }
}

Write-Host "Ollama pronto em $endpoint" -ForegroundColor Green

if (-not (Test-Path 'node_modules\yaml\package.json')) {
  Write-Step 'Instalando dependencias...'
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install falhou com codigo $LASTEXITCODE."
  }
}

Write-Step 'Gerando a newsletter...'
& npm.cmd run daily
if ($LASTEXITCODE -ne 0) {
  throw "A geracao falhou com codigo $LASTEXITCODE."
}

Write-Host ''
Write-Host 'Newsletter gerada com sucesso.' -ForegroundColor Green
Write-Host 'HTML e PDF estao na pasta output.'
