#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

step() { printf '\n\033[36m%s\033[0m\n' "$1"; }
ok() { printf '%-18s\033[32m%s\033[0m\n' "$1" "${2:-OK}"; }
fail() { printf '\n\033[31mErro: %s\033[0m\n' "$1" >&2; exit 1; }

dotenv_value() {
  local key="$1"
  [[ -f .env ]] || return 0
  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" .env | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0
  line="${line#*=}"
  line="${line#\"}"; line="${line%\"}"
  line="${line#\'}"; line="${line%\'}"
  printf '%s' "$line"
}

MODEL="${OLLAMA_MODEL:-$(dotenv_value OLLAMA_MODEL)}"
MODEL="${MODEL:-qwen3:4b}"
OLLAMA_ENDPOINT="${OLLAMA_HOST:-$(dotenv_value OLLAMA_HOST)}"
OLLAMA_ENDPOINT="${OLLAMA_ENDPOINT:-http://127.0.0.1:11434}"
OLLAMA_ENDPOINT="${OLLAMA_ENDPOINT%/}"
BROWSER_OVERRIDE="${BROWSER_PATH:-$(dotenv_value BROWSER_PATH)}"
OLLAMA_PID=""

cleanup() {
  if [[ -n "${OLLAMA_PID:-}" ]] && kill -0 "$OLLAMA_PID" 2>/dev/null; then
    step 'Encerrando Ollama iniciado pelo Highlords...'
    kill "$OLLAMA_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$OLLAMA_PID" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$OLLAMA_PID" 2>/dev/null; then
      kill -9 "$OLLAMA_PID" 2>/dev/null || true
    fi
    ok 'Ollama' 'encerrado'
  fi
}
trap cleanup EXIT

printf '\n========================================\n'
printf '         HIGH LORDS DAILY\n'
printf '========================================\n'

step 'Verificando ambiente...'

command -v node >/dev/null 2>&1 || fail 'Node.js nao encontrado. Instale Node.js 22.12 ou superior.'
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' >/dev/null 2>&1; then
  fail "Node.js $(node -p 'process.versions.node') encontrado, mas o projeto requer 22.12 ou superior."
fi
ok 'Node.js' "$(node -p 'process.versions.node')"

command -v npm >/dev/null 2>&1 || fail 'npm nao encontrado no PATH.'
ok 'npm'
command -v curl >/dev/null 2>&1 || fail 'curl nao encontrado. Instale curl e execute novamente.'

command -v ollama >/dev/null 2>&1 || fail 'Ollama nao encontrado. Instale em https://ollama.com e execute novamente.'
ok 'Ollama'

find_browser() {
  if [[ -n "${BROWSER_OVERRIDE:-}" && -x "$BROWSER_OVERRIDE" ]]; then printf '%s' "$BROWSER_OVERRIDE"; return; fi
  for command_name in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
    if command -v "$command_name" >/dev/null 2>&1; then command -v "$command_name"; return; fi
  done
  if [[ "$(uname -s)" == 'Darwin' ]]; then
    for candidate in \
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' \
      '/Applications/Chromium.app/Contents/MacOS/Chromium'; do
      if [[ -x "$candidate" ]]; then printf '%s' "$candidate"; return; fi
    done
  fi
}

BROWSER_PATH_FOUND="$(find_browser || true)"
[[ -n "$BROWSER_PATH_FOUND" ]] || fail 'Chrome, Chromium ou Microsoft Edge nao encontrado. Instale um deles ou defina BROWSER_PATH no .env.'
export BROWSER_PATH="${BROWSER_OVERRIDE:-$BROWSER_PATH_FOUND}"
ok 'Navegador' "$(basename "$BROWSER_PATH_FOUND")"

if [[ ! -f node_modules/yaml/package.json || ! -f node_modules/rss-parser/package.json || ! -f node_modules/puppeteer-core/package.json ]]; then
  step 'Instalando dependencias do projeto...'
  npm ci
fi
ok 'Dependencias'

ollama_ready() {
  curl -fsS --max-time 2 "$OLLAMA_ENDPOINT/api/tags" >/dev/null 2>&1
}

if ! ollama_ready; then
  step 'Iniciando Ollama...'
  LOG_DIR="${TMPDIR:-/tmp}/highlords-daily"
  mkdir -p "$LOG_DIR"
  nohup ollama serve >"$LOG_DIR/ollama.log" 2>&1 &
  OLLAMA_PID=$!

  step 'Aguardando a API do Ollama...'
  for _ in $(seq 1 30); do
    sleep 1
    if ollama_ready; then break; fi
    if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
      tail -n 12 "$LOG_DIR/ollama.log" 2>/dev/null || true
      fail "O processo 'ollama serve' encerrou antes de abrir a API."
    fi
  done
fi

ollama_ready || fail "Ollama nao respondeu em $OLLAMA_ENDPOINT apos 30 segundos."
export OLLAMA_HOST="$OLLAMA_ENDPOINT"
ok 'API Ollama' "$OLLAMA_ENDPOINT"

if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -Fxq "$MODEL"; then
  step "Modelo $MODEL nao encontrado. Baixando agora (somente na primeira execucao)..."
  ollama pull "$MODEL"
fi
export OLLAMA_MODEL="$MODEL"
ok 'Modelo' "$MODEL"

step 'Gerando a newsletter...'
npm run daily

printf '\n\033[32mNewsletter gerada com sucesso.\033[0m\n'
printf 'HTML e PDF estao na pasta output.\n'
