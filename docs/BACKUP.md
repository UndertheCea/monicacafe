# Backups and restore

Goal: losing the server loses at most one day of data, and a backup is known to restore.

## What is backed up

| Data | How | Where |
|---|---|---|
| PostgreSQL (all shops, coffees, accounts) | `scripts/backup.sh`: `pg_dump --format=custom`, encrypted with [age](https://age-encryption.org), nightly at **03:00 Asia/Taipei** | the `BACKUP_S3_*` bucket (a different bucket, ideally another account or provider, from the media one) |
| Images (S3 media bucket) | With `BACKUP_MEDIA=true`, the same nightly run mirrors the bucket (`aws s3 sync`, no `--delete`) to `media/` beside the dumps: `<BACKUP_TARGET>/media/`, or `s3://$BACKUP_S3_BUCKET/<prefix>media/`. Images are not encrypted (they are public already) and an image deleted from the bucket stays in the backup, which is the undo for a bad cleanup. Also turn on **bucket versioning** at the production S3 provider if it has it | the backup target |
| Dev SeaweedFS | Nothing by default (dev data is disposable); `BACKUP_MEDIA=true` works against it too | |

Redis and Meilisearch hold nothing yet (compose profiles `cache` / `search`, off by default).

## Images

Set `BACKUP_MEDIA=true`. The `backup` service reads the media bucket with the same settings as the API (`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_INTERNAL_ENDPOINT`; compose fills them in) and copies every object it has not copied yet. The JSON line ends with `"media_objects":N` (`-1` = not mirrored). The database dump is stored first, so a failing image copy exits non-zero and is logged as `backup_loop: backup FAILED` without costing the dump.

- With an S3 target the images pass through a working copy, `BACKUP_MEDIA_CACHE` (default `/backups/.media-cache`, on the `backup_data` volume), so only new images are downloaded each night. It is as large as the bucket: size the volume for it.
- The mirror only grows. Delete old objects under `media/` in the backup by hand if it matters; nothing prunes them on purpose.
- The sweep that deletes unreferenced images has a safety catch: it refuses a run when the database references none of the listed images, or when more than `MEDIA_CLEANUP_MAX_FRACTION` (default 20 %) of them would go, and `MEDIA_CLEANUP_DRY_RUN=true` only logs counts. See `media cleanup refused` in the API log. Run a dry run before pointing a new or restored database at the real bucket.
- **Keys are never reused.** Every upload gets a random key (`storage.NewKey`), so a replaced or removed image never comes back under the same URL and a cached copy can never be stale. Removing an image needs no cache purge (a CDN in front only needs to expire entries by age). nginx sends the one-year `Cache-Control` for `200` / `206` / `304` only; any error (a `404` for a thumbnail asked for before its upload finished, `403`, `5xx`) gets `no-store`, so errors are never remembered.

## Retention

Retention is by **date**, not by file count, in the bucket and in a `BACKUP_TARGET` directory alike. After each upload `backup.sh` keeps the newest dump of each of the **7** most recent days that have one, plus the newest dump of each of the **4** most recent Sundays (Taipei time), and deletes the rest. Several dumps on one day (a restart with `BACKUP_RUN_NOW=true`) replace each other and never push older days out. A file whose name has no date is never deleted. File names: `monicacafe_YYYYMMDD_HHMMSS_<mon..sun>.dump.age`. In the bucket they sit under `BACKUP_S3_PREFIX` (default `monicacafe/`). **A dump that is much smaller than the one before it** (under 50 %: an emptied database looks like this) is still stored, but the run prunes nothing, logs `ERROR: … may have been emptied`, pings `/fail` and exits non-zero. Look at the database before the next night's run; the good dumps are all still there.

Point-in-time recovery (WAL archiving) is out of scope: the recovery point is the last nightly dump.

## Setting it up (production)

1. On a machine that is not the server: `age-keygen -o moni-backup.key`. It prints the public key (`age1…`).
2. Put the **public** key in `.env` as `BACKUP_AGE_RECIPIENT`, and fill `BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT` (empty for AWS), `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`. Give that key write/list/delete on the backup bucket only.
3. `docker compose --profile prod up -d --build backup`. Check once with `BACKUP_RUN_NOW=true` (the service then runs a backup at start) and look at its log: the last line is JSON, `{"file":…,"bytes":…,"seconds":…,"pruned":…}`. A failure exits non-zero and is logged as `backup_loop: backup FAILED`.
4. **Set up the alert** (next section), so a failure or a job that never ran is noticed without anyone reading logs.

## Knowing it failed

Three layers, because a backup can fail loudly (an error), quietly (it stops running) or oddly (it runs and saves something useless):

- **Dead-man's switch.** Create a check at [healthchecks.io](https://healthchecks.io) (or any service with the same URLs) with a period of 1 day and a grace time of a few hours, and put its ping URL in `.env` as `BACKUP_PING_URL`. `backup.sh` does a GET on that URL after each success and a GET on `$BACKUP_PING_URL/fail` after any failure (healthchecks.io's failure signal; services without one just see a 404 there, which is harmless). No ping for a day means an alert, which also covers a container that is down. A failed ping is logged as a warning and never fails the backup. The image has `curl`; the script falls back to `wget`.
- **Container healthcheck.** `backup.sh` writes the time of each success to `/backups/.last_success` (`BACKUP_MARKER`); the compose healthcheck (`scripts/backup_healthcheck.sh`) turns `unhealthy` when that is older than `BACKUP_MAX_AGE_HOURS` (26). See it with `docker compose ps backup`. A new container gets one full window from its start.
- **Size check.** The under-50 % rule above.

Plaintext only exists in memory: an encrypted dump is streamed from `pg_dump` into `age`, so no unencrypted copy is written to disk. The database password is handed to the tools as `PGPASSWORD`, not on the command line, so it does not show in `ps`.

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

# 3. restore (decrypts, refuses a non-empty database, all-or-nothing, runs migrate.sh afterwards)
DATABASE_URL=postgres://… BACKUP_AGE_IDENTITY=./moni-backup.key ./scripts/restore.sh monicacafe_….dump.age

# 4. start again
docker compose up -d --wait
```

On a new server: `docker compose up -d postgres`, with `SEED_DEMO_DATA=false` (`initdb.sh` has already made the empty database and applied migrations on first start, so step 2 empties it), then step 3.

**Images:** after the database, copy them back into the bucket (it only adds objects, never deletes, so it is safe on a live bucket and can be re-run):

```bash
# from a local backup directory
docker compose --profile prod run --rm --no-deps backup sh /monicacafe/scripts/restore_media.sh /backups/media
# or straight from the backup bucket (uses BACKUP_S3_* to read, S3_* to write)
docker compose --profile prod run --rm --no-deps backup sh /monicacafe/scripts/restore_media.sh s3://$BACKUP_S3_BUCKET/monicacafe/media
```

Do this before starting the API against a rebuilt database, or keep `MEDIA_CLEANUP_DRY_RUN=true` until it is done. Restore the database and the images from the same night where you can: an image uploaded after the dump is not referenced by it, and the sweep deletes it after `MEDIA_CLEANUP_MIN_AGE`.

`restore.sh` uses `pg_restore --single-transaction --exit-on-error --no-owner`, so it is all or nothing: if anything fails, the database is left empty rather than half loaded, and you can simply run it again. It then runs `scripts/migrate.sh`, so a dump from an older release gets the newer migrations. Users' sessions (refresh tokens) are in the dump; images are restored separately (above).

**How long:** about a minute for a database of a few hundred MB (dump and restore are both I/O bound; the demo database takes seconds). Allow 15 minutes in total including fetching the key and the dump and restarting the stack.

## The restore drill

CI (job `stack`) proves the real chain on every run: it makes a throwaway age key, runs `backup.sh` against the dev SeaweedFS (a second bucket, `backups`) with encryption on, and checks the upload, the listing, date-based retention (it seeds ten old dumps and expects seven days to remain), the success marker and the healthcheck (`scripts/backup_drill.sh`). Then it drops the `public` schema, downloads and decrypts the newest dump with `restore.sh`, restarts the stack and runs `smoke.sh` again. What CI cannot cover is your real provider and your real key: do a manual drill (the steps above, into a scratch database) after setting up, and again every few months. A second step does the same for images (`BACKUP_MEDIA=true`, #288): after the backup it checks that images were mirrored, deletes one from the bucket (`scripts/media_drill.sh`), expects nginx to answer `404` for it, runs `restore_media.sh`, and expects `200` again.
