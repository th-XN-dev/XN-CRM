#!/bin/sh
# Restores a backup into the production database. DESTRUCTIVE: it replaces
# the current data. Stop the API first so nothing writes during the restore.
#
#   docker compose -f docker-compose.prod.yml --env-file .env.production stop api
#   scripts/restore-postgres.sh backups/daily/xn_crm_2026-10-01_023000.dump
#   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
set -eu

dump="${1:?usage: scripts/restore-postgres.sh <file.dump>}"
[ -f "$dump" ] || { echo "no such file: $dump" >&2; exit 1; }
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"

printf 'Restore %s over the production database? Type "restore" to continue: ' "$dump"
read -r answer
[ "$answer" = "restore" ] || { echo "aborted"; exit 1; }

$COMPOSE exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error' < "$dump"
echo "restored $dump — start the API: the migrate service re-applies any newer migrations"
