#!/bin/sh
# Self-test for backup.sh's retention guard (#348), with no database: a fake
# pg_dump on PATH writes a dump of FAKE_DUMP_BYTES bytes into a temporary
# BACKUP_TARGET directory. Checks that a shrunk dump stops pruning on every
# run (not just the first), that BACKUP_ACCEPT_SHRINK=true lets one run prune,
# and that a normal run prunes old days. Runs in CI (backend job).
#
#   ./scripts/backup_selftest.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/store"

cat >"$tmp/bin/pg_dump" <<'EOF'
#!/bin/sh
out=""
while [ $# -gt 0 ]; do
  case "$1" in --file) out=$2; shift ;; esac
  shift
done
[ -n "$out" ] || { echo "fake pg_dump: no --file" >&2; exit 2; }
head -c "${FAKE_DUMP_BYTES:?}" /dev/zero >"$out"
EOF
chmod +x "$tmp/bin/pg_dump"

fail() { echo "backup_selftest: FAIL: $*" >&2; exit 1; }
count() { find "$tmp/store" -maxdepth 1 -type f -name 'monicacafe_*.dump' | wc -l | tr -d ' '; }

# Ten good dumps on old days (all Mondays by name, so no weekly keeps).
for d in 01 02 03 04 05 06 07 08 09 10; do
  head -c 10000 /dev/zero >"$tmp/store/monicacafe_202601${d}_030000_mon.dump"
done

run() { # $1: dump size; extra env as further args. Prints the exit status.
  bytes=$1; shift
  sleep 1 # file names carry the second; two runs must not share one
  rc=0
  env PATH="$tmp/bin:$PATH" FAKE_DUMP_BYTES="$bytes" DATABASE_URL=postgres://x@localhost/x \
    BACKUP_TARGET="$tmp/store" BACKUP_ALLOW_PLAINTEXT=true "$@" \
    sh "$here/backup.sh" >"$tmp/out" 2>"$tmp/err" || rc=$?
  echo "$rc"
}

# 1. An emptied database: kept, nothing pruned, non-zero exit.
[ "$(run 100)" = 1 ] || fail "a shrunk dump should exit 1: $(cat "$tmp/err")"
[ "$(count)" = 11 ] || fail "a shrunk dump pruned something ($(count) dumps left)"
grep -q 'under 50% of the largest' "$tmp/err" || fail "no shrink error logged"

# 2. The next night is just as small: still refused, still nothing pruned.
[ "$(run 100)" = 1 ] || fail "the second shrunk dump in a row should exit 1 (#348)"
[ "$(count)" = 12 ] || fail "the second shrunk dump pruned something ($(count) dumps left)"

# 3. A bad override value is refused before anything is dumped.
[ "$(run 100 BACKUP_ACCEPT_SHRINK=yes)" = 1 ] || fail "BACKUP_ACCEPT_SHRINK=yes should be refused"
grep -q 'BACKUP_ACCEPT_SHRINK must be' "$tmp/err" || fail "no message for a bad BACKUP_ACCEPT_SHRINK"
[ "$(count)" = 12 ] || fail "a refused run stored a dump"

# 4. The operator accepts the shrink: this run prunes (today + the 6 newest old days stay).
[ "$(run 100 BACKUP_ACCEPT_SHRINK=true)" = 0 ] || fail "BACKUP_ACCEPT_SHRINK=true should succeed: $(cat "$tmp/err")"
grep -q '"pruned":6' "$tmp/out" || fail "expected 6 pruned, got: $(cat "$tmp/out")"
[ "$(count)" = 7 ] || fail "expected 7 dumps after pruning, found $(count)"

# 5. A normal-sized dump after that: still compared with the largest kept (10000).
[ "$(run 6000)" = 0 ] || fail "a dump over 50% of the largest should succeed: $(cat "$tmp/err")"

echo "backup_selftest: ok"
