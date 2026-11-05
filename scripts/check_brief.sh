#!/usr/bin/env bash
# Keeps PROJECT_BRIEF.md short and structured. Agents rewrite it every session;
# this stops it from slowly turning back into a long history file.
#   ./scripts/check_brief.sh            (run from the repo root; CI runs it)
set -euo pipefail

BRIEF="${1:-PROJECT_BRIEF.md}"
MAX_LINES=250
REQUIRED=("## Final target" "## Status" "## Last session" "## Current focus" "## Decisions")
fail=0

if [[ ! -f "$BRIEF" ]]; then
  echo "FAIL $BRIEF is missing"; exit 1
fi

lines=$(wc -l < "$BRIEF")
if (( lines > MAX_LINES )); then
  echo "FAIL $BRIEF has $lines lines (max $MAX_LINES) — move detail to docs/SESSION_LOG.md"; fail=1
else
  echo "ok   $BRIEF has $lines lines (max $MAX_LINES)"
fi

for h in "${REQUIRED[@]}"; do
  # Exact heading, optionally followed by a space and more text.
  if grep -qE "^${h}( .*)?$" "$BRIEF"; then
    echo "ok   section '$h'"
  else
    echo "FAIL missing section '$h' (heading must start the line)"; fail=1
  fi
done

if [[ ! -f docs/SESSION_LOG.md ]]; then
  echo "FAIL docs/SESSION_LOG.md is missing"; fail=1
fi

exit $fail
