#!/bin/sh
# Restores a backup made by scripts/backup.sh into an EMPTY database (#220).
#
#   DATABASE_URL=postgres://… BACKUP_AGE_IDENTITY=/path/to/key.txt ./scripts/restore.sh monicacafe_….dump.age
#
# A .age file is decrypted first with the private key file BACKUP_AGE_IDENTITY
# (held offline by the owner, see docs/BACKUP.md). The database must exist and
# have no tables in schema public; this never overwrites data. To restore over a
# live database, drop and recreate it first (docs/BACKUP.md). After pg_restore
# (--no-owner), scripts/migrate.sh runs, so a dump from an older release catches
# up with migrations/. POSIX sh; the client tools must be PostgreSQL 17+.
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

case "$dump" in
  *.age)
    [ -n "${BACKUP_AGE_IDENTITY:-}" ] && [ -f "$BACKUP_AGE_IDENTITY" ] || die "$dump is encrypted: set BACKUP_AGE_IDENTITY to the private key file"
    age -d -i "$BACKUP_AGE_IDENTITY" -o "$work/restore.dump" "$dump"
    dump="$work/restore.dump"
    ;;
esac

tables=$(psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
[ "$tables" = "0" ] || die "the target database already has $tables tables in public; restore only into an empty database"

pg_restore --no-owner --exit-on-error --dbname "$DATABASE_URL" "$dump"
echo "restore: dump loaded, applying any newer migrations"
sh "$here/migrate.sh"
echo "restore: done"
