# Backups and restore

Goal: losing the server loses at most one day of data, and a backup is known to restore.

## What is backed up

| Data | How | Where |
|---|---|---|
| PostgreSQL (all shops, coffees, accounts) | `scripts/backup.sh`: `pg_dump --format=custom`, encrypted with [age](https://age-encryption.org), nightly at **03:00 Asia/Taipei** | the `BACKUP_S3_*` bucket (a different bucket, ideally another account or provider, from the media one) |
| Images (S3 media bucket) | Not copied. Turn on **bucket versioning** at the production S3 provider (and a lifecycle rule that expires old versions after ~30 days), so an overwrite or delete can be undone | the media bucket |
| Dev SeaweedFS | Nothing: dev data is disposable | |

Redis and Meilisearch hold nothing yet (compose profiles `cache` / `search`, off by default).

## Retention

The newest **7** dumps (daily) plus the newest **4** taken on a Sunday (Taipei time), pruned by `backup.sh` after each upload. File names: `monicacafe_YYYYMMDD_HHMMSS_<mon..sun>.dump.age`. In the bucket they sit under `BACKUP_S3_PREFIX` (default `monicacafe/`). Point-in-time recovery (WAL archiving) is out of scope: the recovery point is the last nightly dump.

## Setting it up (production)

1. On a machine that is not the server: `age-keygen -o moni-backup.key`. It prints the public key (`age1…`).
2. Put the **public** key in `.env` as `BACKUP_AGE_RECIPIENT`, and fill `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT` (empty for AWS), `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`. Give that key write/list/delete on the backup bucket only.
3. `docker compose --profile prod up -d --build backup`. Check once with `BACKUP_RUN_NOW=true` (the service then runs a backup at start) and look at its log: the last line is JSON, `{"file":…,"bytes":…,"seconds":…,"pruned":…}`. A failure exits non-zero and is logged as `backup_loop: backup FAILED`; watch the log (or the bucket's newest object) for it.

**Who holds the decryption key:** the owner (`UndertheCea`), offline (password manager plus a printed or USB copy kept elsewhere). The server never has it, so a stolen backup bucket or server is no leak. **Losing the key makes every backup unreadable**; keep two copies.

## Restore

Needs the dump file, the private key, and PostgreSQL 17 client tools (`pg_restore`, `psql`) and `age`. The easiest place is the compose `backup` image.

```bash
# 1. fetch the dump you want (newest, normally)
aws s3 ls s3://$BACKUP_S3_BUCKET/monicacafe/                      # add --endpoint-url for non-AWS
aws s3 cp s3://$BACKUP_S3_BUCKET/monicacafe/monicacafe_….dump.age .

# 2. stop what writes to the database, and empty it
docker compose stop nginx frontend backend
docker compose exec postgres psql -U monica -d monicacafe -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

# 3. restore (decrypts, refuses a non-empty database, runs migrate.sh afterwards)
DATABASE_URL=postgres://… BACKUP_AGE_IDENTITY=./moni-backup.key ./scripts/restore.sh monicacafe_….dump.age

# 4. start again
docker compose up -d --wait
```

On a new server: `docker compose up -d postgres`, with `SEED_DEMO_DATA=false` (`initdb.sh` has already made the empty database and applied migrations on first start, so step 2 empties it), then step 3.

`restore.sh` uses `pg_restore --no-owner`, then `scripts/migrate.sh`, so a dump from an older release gets the newer migrations. Users' sessions (refresh tokens) are in the dump; images come from the media bucket and are not touched.

**How long:** about a minute for a database of a few hundred MB (dump and restore are both I/O bound; the demo database takes seconds). Allow 15 minutes in total including fetching the key and the dump and restarting the stack.

## The restore drill

CI (job `stack`) proves the chain on every run: after the smoke test it runs `backup.sh` into a directory (plaintext, `BACKUP_ALLOW_PLAINTEXT=true`, since CI has no key), drops the `public` schema, runs `restore.sh`, restarts the stack and runs `smoke.sh` again. The encrypted path and the S3 upload are exercised only in production: do a manual drill (the steps above, into a scratch database) after setting up, and again every few months.
