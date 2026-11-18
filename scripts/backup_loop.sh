#!/bin/sh
# Runs scripts/backup.sh every night at BACKUP_HOUR (default 3) Taipei time;
# the compose `backup` service's command (#220). A failed run is logged and
# retried the next night (a failure also pings BACKUP_PING_URL/fail from backup.sh,
# and the compose healthcheck goes unhealthy after 26 h without a success); the
# container keeps running. BACKUP_RUN_NOW=true also
# runs one backup at start (to check the setup).
set -u
here=$(cd "$(dirname "$0")" && pwd)
hour="${BACKUP_HOUR:-3}"
case "$hour" in [0-9]|[01][0-9]|2[0-3]) ;; *) echo "backup_loop: BACKUP_HOUR must be 0-23, got '$hour'" >&2; exit 1 ;; esac

# This script is PID 1 in the container: docker stop sends it SIGTERM. Children run in the
# background so the signal interrupts wait; the backup gets the signal too and is waited for,
# so its EXIT trap (ping /fail, clean up) runs before the container goes (#381).
child=""
on_term() {
  if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
  exit 143
}
trap on_term TERM INT

run() {
  sh "$here/backup.sh" &
  child=$!
  rc=0; wait "$child" || rc=$?
  child=""
  [ "$rc" = 0 ] || echo "backup_loop: backup FAILED, trying again tomorrow" >&2
}

# Strip a leading zero so arithmetic never reads "08" as octal.
num() { n="${1#0}"; echo "${n:-0}"; }

# Tells scripts/backup_healthcheck.sh when this container began (a new container gets a full window).
if [ -n "${BACKUP_MARKER:-}" ]; then
  mkdir -p "$(dirname "$BACKUP_MARKER")" && date +%s >"$(dirname "$BACKUP_MARKER")/.loop_started"
fi
if [ "${BACKUP_RUN_NOW:-false}" = "true" ]; then run; fi
while :; do
  # Seconds since Taipei midnight (UTC+8, no DST), then until the next HH:00.
  now=$(TZ=UTC-8 date +%H:%M:%S)
  h=${now%%:*}; rest=${now#*:}; m=${rest%%:*}; s=${rest#*:}
  since=$(( $(num "$h") * 3600 + $(num "$m") * 60 + $(num "$s") ))
  wait=$(( $(num "$hour") * 3600 - since ))
  [ "$wait" -gt 0 ] || wait=$(( wait + 86400 ))
  echo "backup_loop: next backup in ${wait}s"
  sleep "$wait" &
  child=$!
  wait "$child" || true
  child=""
  run
done
