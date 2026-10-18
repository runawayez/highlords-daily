#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Instale Node.js 22.12 ou superior.' >&2; exit 1; }
exec node src/cli/launch.mjs "$@"
