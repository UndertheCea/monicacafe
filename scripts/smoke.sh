#!/usr/bin/env bash
# Smoke-test the Stage 1 demo after `docker compose up`:
#
#   ./scripts/smoke.sh                       # via nginx on http://localhost
#   BASE_URL=http://localhost:3000 API_URL=http://localhost:4000 ./scripts/smoke.sh
#
# Checks every demo route returns 200 (and an unknown route 404), that the API
# answers health + GraphQL, and that the seed produced map pins and coffees.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
API_URL="${API_URL:-$BASE_URL}"
fail=0

check_status() { # path expected
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1") || code="000"
  if [[ "$code" == "$2" ]]; then echo "ok   $2 $1"; else echo "FAIL $1 → $code (want $2)"; fail=1; fi
}

for path in / /coffees /shops /map; do check_status "$BASE_URL$path" 200; done
check_status "$BASE_URL/shops/__no-such-shop__" 404
check_status "$API_URL/health" 200

body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ shopsForMap { slug lat lng } popularCoffees(limit: 1) { id } }"}') || body=""
pins=$(grep -o '"lat":[0-9.-]*' <<<"$body" | wc -l || true)
coffees=$(grep -o '"id":"' <<<"$body" | wc -l || true)
if [[ "$body" == *'"errors"'* || "$pins" -eq 0 || "$coffees" -eq 0 ]]; then
  echo "FAIL graphql: expected map pins and popular coffees, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql ($pins map pins, popular coffees present)"
fi

if [[ $fail -ne 0 ]]; then echo "smoke test FAILED"; exit 1; fi
echo "smoke test passed"
