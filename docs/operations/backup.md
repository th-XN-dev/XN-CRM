# PostgreSQL backup & restore

Scope: the production stack (`docker-compose.prod.yml`). Redis holds only the
notification queue — every delivery is also recorded in PostgreSQL, and PENDING
deliveries are re-queued on start — so **PostgreSQL is the only thing to back up**.

## Daily backup

`scripts/backup-postgres.sh` runs `pg_dump --format=custom` inside the `postgres`
container, writes the dump atomically (`*.partial` → rename), makes it readable
only by its owner (`chmod 600`, directory `700`) and **verifies** it with
`pg_restore --list`. A failed step exits non-zero, so cron mail / monitoring sees it.

```cron
# /etc/cron.d/xn-crm — every day at 02:30 server time
30 2 * * * deploy cd /srv/xn-crm && scripts/backup-postgres.sh >> /var/log/xn-crm-backup.log 2>&1
```

## Retention policy

| Tier    | When             | Kept (default) | Variable       |
| ------- | ---------------- | -------------- | -------------- |
| daily   | every run        | 7              | `KEEP_DAILY`   |
| weekly  | Sunday's dump    | 4              | `KEEP_WEEKLY`  |
| monthly | 1st of the month | 12             | `KEEP_MONTHLY` |

Older files are deleted by the script after a successful dump.

**Off-site copy (required):** a backup on the same server dies with the server.
Sync `backups/` to storage in another location after the dump, for example
`rclone sync backups remote:xn-crm-backups` or an S3 bucket with versioning and
server-side encryption. Keep the off-site bucket write-only for the server.

Backups contain personal data (families, phones, payments): treat them like the
database itself — encrypted at rest, restricted access, never in the repository
(`backups/`, `*.dump`, `*.sql.gz` are git-ignored and docker-ignored).

## Restore procedure

1. Pick the dump (`ls -lt backups/daily`) and check it: `pg_restore --list <file> | head`.
2. Stop the API so nothing writes during the restore:
   `docker compose -f docker-compose.prod.yml --env-file .env.production stop api`
3. Restore (asks for confirmation, replaces current data):
   `scripts/restore-postgres.sh backups/daily/xn_crm_YYYY-MM-DD_HHMMSS.dump`
4. Start the stack: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d`
   — the `migrate` job re-applies migrations newer than the dump, then the API starts.
5. Verify: `GET /health` is `healthy`, log in, open a few recent records.

## Restore drill (monthly)

An untested backup is a hope, not a backup. Once a month restore the latest dump
into a scratch database and compare row counts:

```sh
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'createdb -U "$POSTGRES_USER" restore_check'
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_check --no-owner --exit-on-error' < backups/daily/<latest>.dump
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c "select count(*) from payments"'
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  sh -c 'dropdb -U "$POSTGRES_USER" restore_check'
```

## Targets

- **RPO** (max data loss): 24 h with daily dumps. For less, add WAL archiving /
  point-in-time recovery (e.g. pgBackRest or a managed PostgreSQL) — a V2 topic.
- **RTO** (time to restore): minutes for the current data size; measure it in the drill.
