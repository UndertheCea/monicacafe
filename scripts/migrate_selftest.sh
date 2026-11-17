#!/usr/bin/env bash
# Self-test for scripts/migrate.sh (#209), run by CI. Needs a role that can
# create databases; uses (and drops) two scratch databases on the same server.
#
#   DATABASE_URL=postgres://monica:monica_secret@localhost:5432/monicacafe ./scripts/migrate_selftest.sh
#
# 1. A fresh database gets every migration; a second run changes nothing.
# 2. An "old" database (migrations applied by hand, as before #209) is refused,
#    then brought up to date with MIGRATE_BASELINE, ending with the same columns
#    as the fresh one. Run again, it changes nothing.
# 3. A failing migration rolls back: nothing it created is left, nothing is recorded.
# 4. Every migration has a baseline marker, false just before it runs and true
#    after (#352), so MIGRATE_BASELINE works at any version.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
url="${DATABASE_URL:?set DATABASE_URL to a database on the server to test against}"
base="${url%/*}"          # postgres://user:pw@host:port
query=""
case "$url" in *\?*) query="?${url#*\?}"; base="${url%%\?*}"; base="${base%/*}" ;; esac
fresh="mig_selftest_fresh"
old="mig_selftest_old"
marks="mig_selftest_marks"
admin="$base/postgres$query"
db() { echo "$base/$1$query"; }

migrations=("$root"/migrations/[0-9][0-9][0-9]_*.sql)
total=${#migrations[@]}
(( total >= 2 )) || { echo "need at least two migrations"; exit 1; }
# The "old" database stops one migration short of the newest.
upto=$(basename "${migrations[total-2]}" | cut -c1-3)

scratch=$(mktemp -d)
cleanup() {
  rm -rf "$scratch"
  psql "$admin" -X -q -c "DROP DATABASE IF EXISTS $fresh" -c "DROP DATABASE IF EXISTS $old" -c "DROP DATABASE IF EXISTS $marks" >/dev/null 2>&1 || true
}
trap cleanup EXIT
psql "$admin" -X -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $fresh" -c "DROP DATABASE IF EXISTS $old" \
  -c "DROP DATABASE IF EXISTS $marks" -c "CREATE DATABASE $fresh" -c "CREATE DATABASE $old" -c "CREATE DATABASE $marks" 2>/dev/null

fail=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; fail=1; }
count() { psql "$(db "$1")" -X -At -c "SELECT count(*) FROM schema_migrations"; }
columns() {
  psql "$(db "$1")" -X -At -c "SELECT table_name, column_name, data_type, is_nullable, coalesce(column_default, '')
    FROM information_schema.columns WHERE table_schema = 'public' ORDER BY 1, 2"
}

# 1 ─ fresh
if DATABASE_URL="$(db $fresh)" "$root/scripts/migrate.sh" >/dev/null && [[ "$(count $fresh)" == "$total" ]]; then
  ok "fresh database: all $total migrations applied and recorded"
else
  bad "fresh database: $(count $fresh 2>/dev/null || echo none) of $total recorded"
fi
out=$(DATABASE_URL="$(db $fresh)" "$root/scripts/migrate.sh")
if [[ "$out" == *"up to date ($total migrations)"* && "$out" != *applying* ]]; then
  ok "second run on the fresh database changes nothing"
else
  bad "second run: $out"
fi

# 2 ─ old, then baseline
for f in "${migrations[@]:0:total-1}"; do
  psql "$(db $old)" -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || bad "applying $(basename "$f") by hand"
done
if DATABASE_URL="$(db $old)" "$root/scripts/migrate.sh" >"$scratch/out" 2>&1; then
  bad "an untracked database with tables was not refused"
elif grep -q MIGRATE_BASELINE "$scratch/out"; then
  ok "untracked database refused, pointing at MIGRATE_BASELINE"
else
  bad "refused without explaining: $(cat "$scratch/out")"
fi
out=$(MIGRATE_BASELINE="$upto" DATABASE_URL="$(db $old)" "$root/scripts/migrate.sh")
newest=$(basename "${migrations[total-1]}" .sql)
if [[ "$out" == *"applying $newest"* && "$(grep -c applying <<<"$out")" == 1 && "$(count $old)" == "$total" ]]; then
  ok "MIGRATE_BASELINE=$upto recorded 001–$upto and applied only $newest"
else
  bad "baseline run: $out"
fi
if diff <(columns $fresh) <(columns $old) >"$scratch/diff"; then
  ok "the upgraded database has the same columns as the fresh one"
else
  bad "columns differ after the upgrade:"; cat "$scratch/diff"
fi
out=$(DATABASE_URL="$(db $old)" "$root/scripts/migrate.sh")
[[ "$out" != *applying* ]] && ok "second run on the upgraded database changes nothing" || bad "rerun after baseline: $out"

# 3 ─ a failing migration
cp "$root"/migrations/*.sql "$scratch/"
printf 'CREATE TABLE selftest_half_done (id int);\nSELECT 1/0;\n' >"$scratch/999_selftest_broken.sql"
if MIGRATIONS_DIR="$scratch" DATABASE_URL="$(db $fresh)" "$root/scripts/migrate.sh" >/dev/null 2>&1; then
  bad "a failing migration was reported as success"
fi
left=$(psql "$(db $fresh)" -X -At -c "SELECT (to_regclass('selftest_half_done') IS NOT NULL)::int + (SELECT count(*) FROM schema_migrations WHERE version LIKE '999%')")
[[ "$left" == "0" ]] && ok "a failing migration is rolled back and not recorded" || bad "a failing migration left $left things behind"

# 4 ─ every migration's baseline marker (#352)
marker_fail=0
for f in "${migrations[@]}"; do
  v=$(basename "$f" | cut -c1-3)
  if ! cond=$(MIGRATE_PRINT_MARKER="$v" "$root/scripts/migrate.sh" 2>/dev/null); then
    bad "migration $v has no baseline marker in scripts/migrate.sh"; marker_fail=1; continue
  fi
  before=$(psql "$(db $marks)" -X -At -c "SELECT $cond" 2>&1)
  psql "$(db $marks)" -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || bad "applying $(basename "$f") by hand"
  after=$(psql "$(db $marks)" -X -At -c "SELECT $cond" 2>&1)
  if [[ "$before" != "f" || "$after" != "t" ]]; then
    bad "marker for $v is '$before' before and '$after' after it (want f, t)"; marker_fail=1
  fi
done
(( marker_fail == 0 )) && ok "all $total baseline markers are false before their migration and true after"

(( fail == 0 )) && echo "migrate self-test passed" || { echo "migrate self-test FAILED"; exit 1; }
