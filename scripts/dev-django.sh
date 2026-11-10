#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
export DATA_SOURCE=django DEMO_ENVIRONMENT=0
export DJANGO_API_URL="${DJANGO_API_URL:-http://127.0.0.1:8000/api/v1}"
printf 'Frontend uses Django API: %s\nStart AI-Manager-backend separately.\n' "$DJANGO_API_URL"
npx --yes pnpm@10.33.0 install --frozen-lockfile
exec npx --yes pnpm@10.33.0 --filter @all/web dev
