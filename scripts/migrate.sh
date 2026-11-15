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
# MIGRATE_BASELINE is checked, not believed: the newest table / column that
# migration NNN created must exist, or nothing is recorded (a value set too high
# would mark migrations as applied that never ran). Only versions with a known
# marker (baseline_marker below) are accepted; add a case there with each new
# migration.
#
# Each migration waits at most MIGRATE_LOCK_TIMEOUT (default 10s; a number plus
# ms, s or min) for table locks, so a migration queued behind a long query fails
# instead of blocking the site; a re-run retries it.
# Waits up to MIGRATE_WAIT seconds (default 60) for the server to accept
# connections. The password in DATABASE_URL is passed as PGPASSWORD, not on the
# command line. POSIX sh: it runs in the postgres:17.11-alpine image.
set -eu

dir="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/migrations}"
baseline="${MIGRATE_BASELINE:-}"
wait_s="${MIGRATE_WAIT:-60}"
lock_timeout="${MIGRATE_LOCK_TIMEOUT:-10s}"
# pg_advisory_lock key: any constant shared by every run ("moni" in ASCII).
lock_key=1836019305

say() { echo "migrate: $*"; }
# printf, not echo: dash's echo turns "\e" into ESC, which breaks \else / \endif.
line() { printf '%s\n' "$1"; }
die() { echo "migrate: $*" >&2; exit 1; }

# Keep the password out of the process list: postgres://user:PASSWORD@host/db
# becomes PGPASSWORD plus a URL without it. (A password containing % is
# URL-encoded and stays in the URL, as libpq decodes it.)
pg_url="${DATABASE_URL:-}"
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

q() { # run one statement, print bare values
  if [ -n "$pg_url" ]; then
    psql "$pg_url" -X -q -v ON_ERROR_STOP=1 -At -c "$1"
  else
    psql -X -q -v ON_ERROR_STOP=1 -At -c "$1"
  fi
}
run_file() { # run a psql script from a file
  if [ -n "$pg_url" ]; then
    psql "$pg_url" -X -q -v ON_ERROR_STOP=1 -f "$1"
  else
    psql -X -q -v ON_ERROR_STOP=1 -f "$1"
  fi
}

# SQL condition that is true when the newest object migration $1 created exists.
# Only versions that could be a baseline are listed: those that existed when
# MIGRATE_BASELINE was the way to adopt an old database.
col() { echo "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$1' AND column_name = '$2')"; }
baseline_marker() {
  case "$1" in
    001) echo "to_regclass('public.variants') IS NOT NULL" ;;
    002) echo "to_regclass('public.refresh_tokens') IS NOT NULL" ;;
    003) echo "EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_lng_range')" ;;
    004) echo "to_regclass('public.variants_coffee_grind_weight_key') IS NOT NULL" ;;
    005) col refresh_tokens replaced_by ;;
    006) echo "EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_variants_touch_coffee')" ;;
    007) col comments edited_at ;;
    008) echo "to_regclass('public.saved_coffees') IS NOT NULL" ;;
    009) echo "to_regclass('public.shop_follows') IS NOT NULL" ;;
    010) col coffees altitude_max_m ;;
    011) col coffees brew_method ;;
    012) col coffees harvest_year ;;
    013) col coffees body ;;
    014) col coffees shop_position ;;
    015) echo "NOT $(col coffees acidity)" ;;
    016) echo "EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coffees' AND column_name = 'roast_level' AND is_nullable = 'YES')" ;;
    017) echo "to_regclass('public.audit_log') IS NOT NULL" ;;
    018) echo "to_regclass('public.upload_grants') IS NOT NULL" ;;
    019) echo "to_regclass('public.reports') IS NOT NULL" ;;
    020) col variants archived_at ;;
    021) echo "to_regclass('public.river_queue') IS NOT NULL" ;;
    022) echo "to_regclass('public.cart_items') IS NOT NULL" ;;
    023) col coffees removed_at ;;
    025) echo "EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_location_pair')" ;;
    026) echo "EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'touch_coffee_from_variant' AND prosrc LIKE '%to_jsonb(NEW)%')" ;;
    027) echo "to_regclass('public.stock_holds') IS NOT NULL" ;;
    *) return 1 ;;
  esac
}

[ -d "$dir" ] || die "no migrations folder at $dir"
case "$baseline" in
  ""|[0-9][0-9][0-9]) ;;
  *) die "MIGRATE_BASELINE must be a three-digit migration number like 014, got '$baseline'" ;;
esac

case "$lock_timeout" in
  [0-9]*) case "$lock_timeout" in *[!0-9a-z]*) die "MIGRATE_LOCK_TIMEOUT must look like 10s, 500ms or 1min, got '$lock_timeout'" ;; esac ;;
  *) die "MIGRATE_LOCK_TIMEOUT must look like 10s, 500ms or 1min, got '$lock_timeout'" ;;
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

if [ "$tracked" != "t" ] && [ -n "$baseline" ]; then
  cond=$(baseline_marker "$baseline") || die "MIGRATE_BASELINE=$baseline has no known marker (001-023 do), so it cannot be verified.
  Add a case for it to baseline_marker in scripts/migrate.sh, or pick a version that is listed there."
  [ "$(q "SELECT $cond")" = "t" ] || die "MIGRATE_BASELINE=$baseline is not true of this database: what migration $baseline created is missing.
  Recording it would mark migrations as applied that never ran. Use the highest version this database really has."
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
    # After the advisory lock: two runners waiting for each other is fine, a long wait on a table lock is not.
    line "SET LOCAL lock_timeout = '$lock_timeout';"
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
