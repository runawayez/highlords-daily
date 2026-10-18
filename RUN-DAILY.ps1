$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Instale Node.js 22.12 ou superior.'
}
& node (Join-Path $PSScriptRoot 'src/cli/launch.mjs') @args
exit $LASTEXITCODE
