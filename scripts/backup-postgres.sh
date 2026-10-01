#!/bin/sh
# Daily PostgreSQL backup of the production stack with tiered retention.
#
#   scripts/backup-postgres.sh                 # run from the project root
#   BACKUP_DIR=/srv/backups scripts/backup-postgres.sh
#
# Cron (daily at 02:30, server time):
#   30 2 * * * cd /srv/xn-crm && scripts/backup-postgres.sh >> /var/log/xn-crm-backup.log 2>&1
#
# Keeps: 7 daily, 4 weekly (Sunday), 12 monthly (1st of month) dumps.
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE="${COMPOSE:-docker compose -f docker-compose.prod.yml --env-file .env.production}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

stamp="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly" "$BACKUP_DIR/monthly"
chmod 700 "$BACKUP_DIR"

target="$BACKUP_DIR/daily/xn_crm_$stamp.dump"
# Custom format: compressed, restorable table by table, verified below.
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$target.partial"
mv "$target.partial" "$target"
chmod 600 "$target"

# A dump that pg_restore cannot list is not a backup.
$COMPOSE exec -T postgres pg_restore --list < "$target" > /dev/null
echo "$(date -Iseconds) backup ok: $target ($(du -h "$target" | cut -f1))"

[ "$(date +%u)" = "7" ] && cp "$target" "$BACKUP_DIR/weekly/"
[ "$(date +%d)" = "01" ] && cp "$target" "$BACKUP_DIR/monthly/"

prune() { # keep the newest $2 files in $1
  ls -1t "$1"/*.dump 2>/dev/null | tail -n +"$(($2 + 1))" | xargs -r rm -f
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"
prune "$BACKUP_DIR/monthly" "$KEEP_MONTHLY"
