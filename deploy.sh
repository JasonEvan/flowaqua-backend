#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for file in .env compose.yaml Caddyfile; do
  if [[ ! -f "$PROJECT_DIR/$file" ]]; then
    printf 'Missing deployment file: %s/%s\n' "$PROJECT_DIR" "$file" >&2
    exit 1
  fi
done

COMPOSE=(docker compose --project-directory "$PROJECT_DIR" --env-file "$PROJECT_DIR/.env" -f "$PROJECT_DIR/compose.yaml")

"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --force-recreate --wait
"${COMPOSE[@]}" ps
