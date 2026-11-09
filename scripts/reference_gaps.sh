#!/usr/bin/env bash
# Gap report for the reference shops (issue #169): every origin, variety and
# process a reference roaster prints that our dropdown tables don't have (after
# case / spacing and the alias list in scripts/seed_reference.sql), with the
# shops and coffees using it. Origin and process gaps mean the coffee was
# skipped; a variety gap only leaves it without a variety. Add the missing
# values in a migration (#174), spelling variants as aliases.
#
#   ./scripts/reference_gaps.sh            # print the report, exit 0
#   ./scripts/reference_gaps.sh --strict   # exit 1 if anything is missing
#
# Connects with $DATABASE_URL (default: the compose database on localhost).
set -euo pipefail

url="${DATABASE_URL:-postgres://monica:monica_secret@localhost:5432/monicacafe}"
strict=false
[[ "${1:-}" == "--strict" ]] && strict=true

if [[ "$(psql "$url" -XAtqc "SELECT to_regclass('reference_gaps') IS NOT NULL")" != "t" ]]; then
  echo "reference_gaps: no reference seed in this database (run scripts/seed_reference.sql, or SEED_REFERENCE_SHOPS=true)" >&2
  exit 2
fi

rows=$(psql "$url" -XAtqc "SELECT count(*) FROM reference_gaps")
coffees=$(psql "$url" -XAtqc "SELECT count(*) FROM reference_catalogue")
echo "reference catalogue: $coffees coffees; values without a match: $rows"
if [[ "$rows" != "0" ]]; then
  psql "$url" -Xq -P pager=off -c "SELECT kind, value, skipped AS coffee_skipped, shops, coffees FROM reference_gaps"
  if $strict; then exit 1; fi
fi
