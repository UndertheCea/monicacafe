#!/bin/sh
# Healthcheck of the compose `backup` service (#289): exits 1 when the last
# successful backup is older than BACKUP_MAX_AGE_HOURS (default 26: one nightly
# run plus slack). backup.sh writes the epoch seconds of each success to
# BACKUP_MARKER; backup_loop.sh writes .loop_started beside it when it starts, so
# a fresh container gets one full window before it can be unhealthy.
set -eu

marker="${BACKUP_MARKER:-/backups/.last_success}"
started="$(dirname "$marker")/.loop_started"
max_hours="${BACKUP_MAX_AGE_HOURS:-26}"
case "$max_hours" in ""|*[!0-9]*) echo "backup_healthcheck: BACKUP_MAX_AGE_HOURS must be a whole number" >&2; exit 1 ;; esac

newest=0
for f in "$marker" "$started"; do
  [ -f "$f" ] || continue
  t=$(cat "$f" 2>/dev/null || echo 0)
  case "$t" in ""|*[!0-9]*) continue ;; esac
  [ "$t" -le "$newest" ] || newest="$t"
done

if [ "$newest" -eq 0 ]; then
  echo "backup_healthcheck: no success recorded in $marker" >&2
  exit 1
fi
age=$(( $(date +%s) - newest ))
if [ "$age" -gt $((max_hours * 3600)) ]; then
  echo "backup_healthcheck: newest backup success is $((age / 3600))h old (limit ${max_hours}h)" >&2
  exit 1
fi
