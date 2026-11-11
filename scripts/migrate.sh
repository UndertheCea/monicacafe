#!/bin/sh
# Applies the migrations a database doesn't have yet (#209).
#
#   DATABASE_URL=postgres://… ./scripts/migrate.sh
#
# Every migrations/NNN_*.sql file that isn't recorded in schema_migrations runs,
# in file-name order, each in its own transaction together with the row that
# records it, so a failing migration leaves nothing half-applied and a re-run
# picks up where it stopped. An advisory lock makes concurrent runs (two API
# hosts starting at once) wait for each other; whoever comes second finds the
# work done.
#
# A database created before this script existed has the tables but no
# schema_migrations. It is refused, because running 001 again on it would fail
# (or worse). Say which migrations it already has instead:
#
#   MIGRATE_BASELINE=014 ./scripts/migrate.sh   # records 001–014, applies 015+
#
# Connection: DATABASE_URL when set, else the usual libpq variables (PGHOST,
# PGUSER, PGDATABASE, …; initdb.sh uses the local socket). MIGRATIONS_DIR
# defaults to the migrations/ folder next to this script.
# Waits up to MIGRATE_WAIT seconds (default 60) for the server to accept
# connections. POSIX sh: it runs in the postgres:17.11-alpine image.
set -eu

dir="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/migrations}"
baseline="${MIGRATE_BASELINE:-}"
wait_s="${MIGRATE_WAIT:-60}"
# pg_advisory_lock key: any constant shared by every run ("moni" in ASCII).
lock_key=1836019305

say() { echo "migrate: $*"; }
# printf, not echo: dash's echo turns "\e" into ESC, which breaks \else / \endif.
line() { printf '%s\n' "$1"; }
die() { echo "migrate: $*" >&2; exit 1; }

q() { # run one statement, print bare values
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At -c "$1"
  else
    psql -X -q -v ON_ERROR_STOP=1 -At -c "$1"
  fi
}
run_file() { # run a psql script from a file
  if [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$1"
  else
    psql -X -q -v ON_ERROR_STOP=1 -f "$1"
  fi
}

[ -d "$dir" ] || die "no migrations folder at $dir"
case "$baseline" in
  ""|[0-9][0-9][0-9]) ;;
  *) die "MIGRATE_BASELINE must be a three-digit migration number like 014, got '$baseline'" ;;
esac

# The server may still be starting (compose starts this next to Postgres).
i=0
until q "SELECT 1" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -ge "$wait_s" ] && die "database not reachable after ${wait_s}s"
  sleep 1
done

files=$(find "$dir" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' | sort)
[ -n "$files" ] || die "no NNN_*.sql files in $dir"

# Two files with one number would apply in an order nobody chose.
dupes=$(for f in $files; do basename "$f" | cut -c1-3; done | uniq -d)
[ -z "$dupes" ] || die "more than one migration numbered $(echo "$dupes" | tr '\n' ' ')"

tracked=$(q "SELECT to_regclass('public.schema_migrations') IS NOT NULL")
if [ "$tracked" != "t" ]; then
  tables=$(q "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
  if [ "$tables" = "0" ] && [ -n "$baseline" ]; then
    die "MIGRATE_BASELINE is set but the database is empty; leave it unset so every migration runs"
  fi
  if [ "$tables" != "0" ] && [ -z "$baseline" ]; then
    die "this database has $tables tables but no schema_migrations, so which migrations it has is unknown.
  If it is up to date with migrations/ up to NNN, run once with MIGRATE_BASELINE=NNN (e.g. the
  highest file it was created with) to record 001–NNN without running them. Or recreate it
  (docker compose down -v deletes all data)."
  fi
fi

[ "$tracked" = "t" ] && [ -n "$baseline" ] && say "MIGRATE_BASELINE ignored: schema_migrations already records what ran"

script=$(mktemp)
trap 'rm -f "$script"' EXIT

{
  line "SET client_min_messages = warning;"
  line "CREATE TABLE IF NOT EXISTS schema_migrations ("
  line "  version    TEXT PRIMARY KEY,"
  line "  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),"
  line "  baselined  BOOLEAN NOT NULL DEFAULT false"
  line ");"
  if [ "$tracked" != "t" ] && [ -n "$baseline" ]; then
    for f in $files; do
      v=$(basename "$f" .sql)
      [ "$(printf %s "$v" | cut -c1-3)" \> "$baseline" ] && continue
      line "INSERT INTO schema_migrations (version, baselined) VALUES ('$v', true) ON CONFLICT DO NOTHING;"
    done
  fi
  for f in $files; do
    v=$(basename "$f" .sql)
    # Names are NNN_ plus letters, digits and underscores: safe to quote as-is.
    case "$v" in *[!A-Za-z0-9_]*) line "\\echo 'migrate: bad file name $v'"; line "SELECT 1/0;"; continue ;; esac
    line "BEGIN;"
    line "SELECT pg_advisory_xact_lock($lock_key) AS locked \\gset"
    line "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '$v') AS done \\gset"
    line "\\if :done"
    line "\\else"
    line "\\echo 'migrate: applying $v'"
    line "\\i '$f'"
    line "INSERT INTO schema_migrations (version) VALUES ('$v');"
    line "\\endif"
    line "COMMIT;"
  done
} >"$script"

before=$(q "SELECT count(*) FROM schema_migrations" 2>/dev/null || echo 0)
run_file "$script" || die "a migration failed; it was rolled back and nothing after it ran"
after=$(q "SELECT count(*) FROM schema_migrations")
[ -n "$baseline" ] && [ "$tracked" != "t" ] && say "recorded 001–$baseline as already applied"
if [ "$before" = "$after" ]; then
  say "up to date ($after migrations)"
else
  say "done: $after migrations recorded"
fi

# A recorded migration whose file is gone is worth a warning, not a failure.
known=$(for f in $files; do basename "$f" .sql; done)
for v in $(q "SELECT version FROM schema_migrations ORDER BY version"); do
  echo "$known" | grep -qx "$v" || say "warning: $v is recorded but migrations/$v.sql doesn't exist"
done
