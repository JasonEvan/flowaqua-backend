#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ ! -f "$PROJECT_DIR/.env" ]]; then
  printf 'Missing .env: copy .env.example to .env and set GHCR_OWNER and VERSION.\n' >&2
  exit 1
fi

docker compose --project-directory "$PROJECT_DIR" --env-file "$PROJECT_DIR/.env" \
  -f "$PROJECT_DIR/compose.yaml" build "$@" backend
