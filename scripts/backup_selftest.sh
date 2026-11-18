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
[ -z "${FAKE_DUMP_STARTED:-}" ] || : >"$FAKE_DUMP_STARTED"
[ -z "${FAKE_DUMP_SLEEP:-}" ] || exec sleep "$FAKE_DUMP_SLEEP"
head -c "${FAKE_DUMP_BYTES:?}" /dev/zero >"$out"
EOF
# A fake curl that records the URL it was asked for (the BACKUP_PING_URL pings).
cat >"$tmp/bin/curl" <<'EOF'
#!/bin/sh
for a in "$@"; do last=$a; done
echo "$last" >>"${FAKE_PINGS:?}"
EOF
chmod +x "$tmp/bin/pg_dump" "$tmp/bin/curl"

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
    BACKUP_TARGET="$tmp/store" BACKUP_ALLOW_PLAINTEXT=true BACKUP_TARGET_ANY=true "$@" \
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

# 5. The accepted shrink left a marker, and it is not a dump: never counted, never pruned.
ls "$tmp/store"/shrink_accepted_* >/dev/null 2>&1 || fail "no shrink_accepted marker stored (#380)"
[ "$(find "$tmp/store" -maxdepth 1 -name 'shrink_accepted_*' | wc -l | tr -d ' ')" = 1 ] || fail "expected one marker"

# 6. The next night is just as small. The old big dumps are still kept, but the
# baseline starts at the accepted dump, so this passes and prunes (#380).
[ "$(run 100)" = 0 ] || fail "a small dump after an accepted shrink should pass (#380): $(cat "$tmp/err")"
grep -q '"pruned":1' "$tmp/out" || fail "expected 1 pruned (the accepted dump, same day), got: $(cat "$tmp/out")"
[ "$(count)" = 7 ] || fail "expected 7 dumps, found $(count)"
ls "$tmp/store"/shrink_accepted_* >/dev/null 2>&1 || fail "the marker was pruned"

# 7. A normal dump, then a further big drop: still caught against the new baseline.
[ "$(run 6000)" = 0 ] || fail "a bigger dump should succeed: $(cat "$tmp/err")"
[ "$(run 2000)" = 1 ] || fail "a further drop under 50% should still exit 1 (#380)"
grep -q 'under 50% of the largest' "$tmp/err" || fail "no shrink error logged for the further drop"

# 10. A local target that is not on a volume is refused (#382); a bad override value too.
[ "$(run 100 BACKUP_TARGET_ANY=false)" = 1 ] || fail "a target outside /backups should be refused (#382)"
grep -q 'neither /backups' "$tmp/err" || fail "no message for a target outside the volume: $(cat "$tmp/err")"
[ "$(run 100 BACKUP_TARGET_ANY=false BACKUP_TARGET=/backups/../tmp/x)" = 1 ] || fail "a .. path out of /backups should be refused"
[ "$(run 100 BACKUP_TARGET_ANY=maybe)" = 1 ] || fail "BACKUP_TARGET_ANY=maybe should be refused"
[ "$(count)" = 8 ] || fail "a refused run stored a dump ($(count))"

# 8. SIGTERM mid-dump (docker stop, #381): exit 143, a /fail ping, no work dir, no partial.
mkdir -p "$tmp/tmpdir"
sleep 1
env PATH="$tmp/bin:$PATH" TMPDIR="$tmp/tmpdir" FAKE_DUMP_BYTES=100 FAKE_DUMP_SLEEP=30 \
  FAKE_DUMP_STARTED="$tmp/started" FAKE_PINGS="$tmp/pings" BACKUP_PING_URL=http://ping.invalid/x \
  DATABASE_URL=postgres://x@localhost/x BACKUP_TARGET="$tmp/store" BACKUP_ALLOW_PLAINTEXT=true BACKUP_TARGET_ANY=true \
  sh "$here/backup.sh" >"$tmp/out" 2>"$tmp/err" &
pid=$!
i=0
while [ ! -e "$tmp/started" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
[ -e "$tmp/started" ] || fail "the slow fake pg_dump never started"
kill -TERM "$pid"
rc=0; wait "$pid" || rc=$?
[ "$rc" = 143 ] || fail "SIGTERM should exit 143, got $rc: $(cat "$tmp/err")"
grep -qx 'http://ping.invalid/x/fail' "$tmp/pings" || fail "no /fail ping after SIGTERM: $(cat "$tmp/pings" 2>&1)"
[ -z "$(ls -A "$tmp/tmpdir")" ] || fail "the work dir was left behind: $(ls -A "$tmp/tmpdir")"
[ -z "$(find "$tmp/store" -maxdepth 1 -name '.*.partial')" ] || fail "a .partial was left in the target"
[ "$(count)" = 8 ] || fail "SIGTERM changed the stored dumps ($(count))"

# 9. backup_loop.sh stops promptly on SIGTERM while waiting for the next night.
BACKUP_HOUR=3 sh "$here/backup_loop.sh" >"$tmp/loop.out" 2>&1 &
pid=$!
sleep 1
kill -TERM "$pid"
i=0
while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 30 ]; do sleep 0.1; i=$((i + 1)); done
if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid"; fail "backup_loop.sh ignored SIGTERM"; fi
rc=0; wait "$pid" || rc=$?
[ "$rc" = 143 ] || fail "backup_loop.sh should exit 143 on SIGTERM, got $rc"

echo "backup_selftest: ok"
