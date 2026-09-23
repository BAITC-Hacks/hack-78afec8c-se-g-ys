#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

(cd "$project_root/packages/draft-api" && uv run uvicorn examples.app:app --host 127.0.0.1 --port 8013) &
api_pid=$!
ui_pid=""
cleanup() {
  kill "$api_pid" 2>/dev/null || true
  if [[ -n "$ui_pid" ]]; then kill "$ui_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

(cd "$project_root/packages/draft-ui" && npm run dev) &
ui_pid=$!
wait "$api_pid" "$ui_pid"
