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

**Images:** after the database, copy them back into the bucket (it only adds objects, never deletes, so it is safe on a live bucket and can be re-run):

```bash
# from a local backup directory
docker compose --profile prod run --rm --no-deps backup sh /monicacafe/scripts/restore_media.sh /backups/media
# or straight from the backup bucket (uses BACKUP_S3_* to read, S3_* to write)
docker compose --profile prod run --rm --no-deps backup sh /monicacafe/scripts/restore_media.sh s3://$BACKUP_S3_BUCKET/monicacafe/media
```

Do this before starting the API against a rebuilt database, or keep `MEDIA_CLEANUP_DRY_RUN=true` until it is done. Restore the database and the images from the same night where you can: an image uploaded after the dump is not referenced by it, and the sweep deletes it after `MEDIA_CLEANUP_MIN_AGE`.

`restore.sh` uses `pg_restore --no-owner`, then `scripts/migrate.sh`, so a dump from an older release gets the newer migrations. Users' sessions (refresh tokens) are in the dump; `restore.sh` does not touch the media bucket (see above).

**How long:** about a minute for a database of a few hundred MB (dump and restore are both I/O bound; the demo database takes seconds). Allow 15 minutes in total including fetching the key and the dump and restarting the stack.

## The restore drill

CI (job `stack`) proves the chain on every run: after the smoke test it runs `backup.sh` into a directory (plaintext, `BACKUP_ALLOW_PLAINTEXT=true`, since CI has no key), drops the `public` schema, runs `restore.sh`, restarts the stack and runs `smoke.sh` again. A second step does the same for images (`BACKUP_MEDIA=true`): after the backup it checks that images were mirrored, deletes one from the bucket (`scripts/media_drill.sh`), expects nginx to answer `404` for it, runs `restore_media.sh`, and expects `200` again. The encrypted path and the S3 upload are exercised only in production: do a manual drill (the steps above, into a scratch database) after setting up, and again every few months.
