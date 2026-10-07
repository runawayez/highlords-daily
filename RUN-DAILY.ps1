$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host $Message -ForegroundColor Cyan
}

function Write-Ok([string]$Label, [string]$Value = 'OK') {
  Write-Host ('{0,-18}' -f $Label) -NoNewline
  Write-Host $Value -ForegroundColor Green
}

function Get-DotEnvValue([string]$Name) {
  if (-not (Test-Path '.env')) { return $null }
  $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)\s*$'
  foreach ($line in Get-Content '.env' -ErrorAction SilentlyContinue) {
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line -match $pattern) {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

function Normalize-HttpHost([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  $hostValue = $Value.Trim().TrimEnd('/')
  if ($hostValue -notmatch '^https?://') { $hostValue = "http://$hostValue" }
  return $hostValue
}

$dotenvHost = Get-DotEnvValue 'OLLAMA_HOST'
$dotenvModel = Get-DotEnvValue 'OLLAMA_MODEL'
$dotenvBrowser = Get-DotEnvValue 'BROWSER_PATH'
$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } elseif ($dotenvModel) { $dotenvModel } else { 'qwen3:4b' }
$preferredHost = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } elseif ($dotenvHost) { $dotenvHost } else { 'http://127.0.0.1:11434' }

function Get-OllamaEndpoints {
  @(
    (Normalize-HttpHost $preferredHost),
    'http://127.0.0.1:11434',
    'http://localhost:11434'
  ) | Where-Object { $_ } | Select-Object -Unique
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

function Test-OllamaModel([string]$Endpoint, [string]$Model) {
  try {
    $data = Invoke-RestMethod "$Endpoint/api/tags" -TimeoutSec 5
    $names = @($data.models | ForEach-Object { $_.name })
    $expected = if ($Model.Contains(':')) { $Model } else { "${Model}:latest" }
    return [bool]($names | Where-Object { $_ -eq $expected -or ($_ -eq $Model -and -not $Model.Contains(':')) } | Select-Object -First 1)
  } catch {
    return $false
  }
}

function Find-Browser {
  $programFiles = [Environment]::GetFolderPath('ProgramFiles')
  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  $browserOverride = if ($env:BROWSER_PATH) { $env:BROWSER_PATH } elseif ($dotenvBrowser) { $dotenvBrowser } else { $null }

  $candidates = @(
    $browserOverride,
    (Join-Path $programFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $programFiles 'Microsoft\Edge\Application\msedge.exe'),
    $(if ($programFilesX86) { Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe' }),
    $(if ($programFilesX86) { Join-Path $programFilesX86 'Microsoft\Edge\Application\msedge.exe' }),
    (Join-Path $localAppData 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $localAppData 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

$ollamaStartedByLauncher = $false
$ollamaProcess = $null

try {
  Write-Host ''
  Write-Host '========================================' -ForegroundColor DarkGray
  Write-Host '         HIGH LORDS DAILY' -ForegroundColor White
  Write-Host '========================================' -ForegroundColor DarkGray
  Write-Host ''
  Write-Step 'Verificando ambiente...'

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js nao encontrado. Instale Node.js 22.12 ou superior e execute novamente.'
  }
  $nodeVersionText = (& node -p "process.versions.node").Trim()
  try { $nodeVersion = [version]$nodeVersionText } catch { throw "Nao foi possivel identificar a versao do Node.js: $nodeVersionText" }
  if ($nodeVersion -lt [version]'22.12.0') {
    throw "Node.js $nodeVersionText encontrado, mas o Highlords Daily requer Node.js 22.12 ou superior."
  }
  Write-Ok 'Node.js' $nodeVersionText

  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { throw 'npm.cmd nao encontrado no PATH. Reinstale o Node.js com npm.' }
  Write-Ok 'npm'

  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) {
    throw 'Ollama nao encontrado. Instale o Ollama em https://ollama.com e execute novamente.'
  }
  Write-Ok 'Ollama'

  $browser = Find-Browser
  if (-not $browser) {
    throw 'Chrome ou Microsoft Edge nao encontrado. Instale um deles ou defina BROWSER_PATH no arquivo .env.'
  }
  Write-Ok 'Navegador' ([IO.Path]::GetFileName($browser))
  if (-not $env:BROWSER_PATH -and $null -eq $dotenvBrowser) { $env:BROWSER_PATH = $browser }

  if (-not (Test-Path 'node_modules\yaml\package.json') -or -not (Test-Path 'node_modules\rss-parser\package.json') -or -not (Test-Path 'node_modules\puppeteer-core\package.json')) {
    Write-Step 'Instalando dependencias do projeto...'
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci falhou com codigo $LASTEXITCODE." }
  }
  Write-Ok 'Dependencias'

  $endpoint = Test-Ollama
  if (-not $endpoint) {
    Write-Step 'Iniciando Ollama...'

    $logDir = Join-Path $env:TEMP 'highlords-daily'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $stdoutLog = Join-Path $logDir 'ollama-stdout.log'
    $stderrLog = Join-Path $logDir 'ollama-stderr.log'
    Remove-Item $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

    try {
      $ollamaProcess = Start-Process -FilePath $ollama.Source -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
      $ollamaStartedByLauncher = $true
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
        if (Test-Path $stderrLog) { $details = (Get-Content $stderrLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n" }
        if (-not $details -and (Test-Path $stdoutLog)) { $details = (Get-Content $stdoutLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n" }
        throw "O processo 'ollama serve' encerrou antes de abrir a API.`n$details"
      }
    }

    if (-not $endpoint) {
      $details = ''
      if (Test-Path $stderrLog) { $details = (Get-Content $stderrLog -Tail 12 -ErrorAction SilentlyContinue) -join "`n" }
      throw "Ollama nao respondeu apos 30 segundos. Log: $stderrLog`n$details"
    }
  }

  $env:OLLAMA_HOST = $endpoint
  Write-Ok 'API Ollama' $endpoint

  if (-not (Test-OllamaModel $endpoint $model)) {
    Write-Step "Modelo $model nao encontrado. Baixando agora (somente na primeira execucao)..."
    & $ollama.Source pull $model
    if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel baixar o modelo $model." }
  }
  $env:OLLAMA_MODEL = $model
  Write-Ok 'Modelo' $model

  Write-Host ''
  Write-Step 'Gerando a newsletter...'
  & npm.cmd run daily
  if ($LASTEXITCODE -ne 0) { throw "A geracao falhou com codigo $LASTEXITCODE." }

  Write-Host ''
  Write-Host 'Newsletter gerada com sucesso.' -ForegroundColor Green
  Write-Host 'HTML e PDF estao na pasta output.'
}
finally {
  if ($ollamaStartedByLauncher -and $ollamaProcess) {
    Write-Host ''
    Write-Step 'Encerrando Ollama iniciado pelo Highlords...'
    try {
      if (-not $ollamaProcess.HasExited) {
        & taskkill.exe /PID $ollamaProcess.Id /T /F 2>$null | Out-Null
      }
      Write-Ok 'Ollama' 'encerrado'
    } catch {
      Write-Warning "Nao foi possivel encerrar automaticamente o Ollama (PID $($ollamaProcess.Id))."
    }
  }
}
