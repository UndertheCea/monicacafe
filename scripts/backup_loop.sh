#!/bin/sh
# Runs scripts/backup.sh every night at BACKUP_HOUR (default 3) Taipei time;
# the compose `backup` service's command (#220). A failed run is logged and
# retried the next night; the container keeps running. BACKUP_RUN_NOW=true also
# runs one backup at start (to check the setup).
set -u
here=$(cd "$(dirname "$0")" && pwd)
hour="${BACKUP_HOUR:-3}"
case "$hour" in [0-9]|[01][0-9]|2[0-3]) ;; *) echo "backup_loop: BACKUP_HOUR must be 0-23, got '$hour'" >&2; exit 1 ;; esac

run() { sh "$here/backup.sh" || echo "backup_loop: backup FAILED, trying again tomorrow" >&2; }

# Strip a leading zero so arithmetic never reads "08" as octal.
num() { n="${1#0}"; echo "${n:-0}"; }

if [ "${BACKUP_RUN_NOW:-false}" = "true" ]; then run; fi
while :; do
  # Seconds since Taipei midnight (UTC+8, no DST), then until the next HH:00.
  now=$(TZ=UTC-8 date +%H:%M:%S)
  h=${now%%:*}; rest=${now#*:}; m=${rest%%:*}; s=${rest#*:}
  since=$(( $(num "$h") * 3600 + $(num "$m") * 60 + $(num "$s") ))
  wait=$(( $(num "$hour") * 3600 - since ))
  [ "$wait" -gt 0 ] || wait=$(( wait + 86400 ))
  echo "backup_loop: next backup in ${wait}s"
  sleep "$wait"
  run
done
