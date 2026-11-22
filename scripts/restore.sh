#!/bin/sh
# Restores a backup made by scripts/backup.sh into an EMPTY database (#220).
#
#   DATABASE_URL=postgres://… BACKUP_AGE_IDENTITY=/path/to/key.txt ./scripts/restore.sh monicacafe_….dump.age
#
# A .age file is decrypted with the private key file BACKUP_AGE_IDENTITY (held
# offline by the owner, see docs/BACKUP.md). The database must exist and have no
# tables in schema public; this never overwrites data. To restore over a live
# database, drop and recreate it first (docs/BACKUP.md). After pg_restore
# (--no-owner), scripts/migrate.sh runs, so a dump from an older release catches
# up with migrations/. POSIX sh; the client tools must be PostgreSQL 17+.
#
# All or nothing (#289): pg_restore runs with --single-transaction and
# --exit-on-error, so a failed restore leaves the database empty, not half loaded.
# An encrypted dump is decrypted straight into pg_restore through a pipe (no
# plaintext file), and the password in DATABASE_URL goes through PGPASSWORD, not
# the command line (visible in ps).
set -eu

die() { echo "restore: $*" >&2; exit 1; }

[ $# -eq 1 ] || die "usage: restore.sh <dump or dump.age>"
dump="$1"
[ -f "$dump" ] || die "no such file: $dump"
[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set"

here=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
chmod 700 "$work"
trap 'rm -rf "$work"' EXIT

# postgres://user:PASSWORD@host/db becomes PGPASSWORD plus a URL without the
# password. (A URL-encoded password, with %, stays in the URL.)
pg_url="$DATABASE_URL"
case "$pg_url" in
  postgres://*:*@*|postgresql://*:*@*)
    pw=$(printf %s "$pg_url" | sed -n 's|^postgres[a-z]*://[^:/@]*:\([^@/]*\)@.*|\1|p')
    case "$pw" in
      ""|*%*) ;;
      *)
        PGPASSWORD="$pw"; export PGPASSWORD
        pg_url=$(printf %s "$pg_url" | sed 's|^\(postgres[a-z]*://[^:/@]*\):[^@/]*@|\1@|')
        ;;
    esac
    ;;
esac

case "$dump" in
  *.age)
    [ -n "${BACKUP_AGE_IDENTITY:-}" ] && [ -f "$BACKUP_AGE_IDENTITY" ] || die "$dump is encrypted: set BACKUP_AGE_IDENTITY to the private key file"
    encrypted=1
    ;;
  *) encrypted=0 ;;
esac

tables=$(psql "$pg_url" -X -q -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
[ "$tables" = "0" ] || die "the target database already has $tables tables in public; restore only into an empty database"

if [ "$encrypted" = 1 ]; then
  # POSIX sh has no pipefail, so age's exit status travels through a file, and
  # pg_restore's is captured so set -e doesn't exit before age's is read. A wrong
  # key makes both fail: age's status is checked first, for the friendly message.
  pg_rc=0
  { rc=0; age -d -i "$BACKUP_AGE_IDENTITY" "$dump" || rc=$?; echo "$rc" >"$work/age.rc"; } \
    | pg_restore --single-transaction --no-owner --exit-on-error --dbname "$pg_url" || pg_rc=$?
  [ "$(cat "$work/age.rc")" = 0 ] || die "decrypting $dump failed (wrong BACKUP_AGE_IDENTITY?)"
  [ "$pg_rc" = 0 ] || die "pg_restore failed loading $dump"
else
  pg_restore --single-transaction --no-owner --exit-on-error --dbname "$pg_url" "$dump"
fi
echo "restore: dump loaded, applying any newer migrations"
sh "$here/migrate.sh"
echo "restore: done"
