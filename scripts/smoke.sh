#!/usr/bin/env bash
# Smoke-test a running Moni Cafe stack (default: nginx on http://localhost).
#
#   docker compose up -d --build --wait
#   ./scripts/smoke.sh                     # or: BASE_URL=http://localhost:8080 ./scripts/smoke.sh
#
# Checks every Stage 1 demo route returns 200 with the expected content, that
# the GraphQL API answers through nginx, and that unknown pages are real 404s.
# Exits non-zero on the first failure summary so it can gate CI.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
BASE_URL="${BASE_URL%/}"
fail=0

pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=1; }

# check_page PATH EXPECTED_STATUS [NEEDLE]
check_page() {
  local path="$1" want="$2" needle="${3:-}" body status
  body="$(mktemp)"
  status="$(curl -sS -o "$body" -w '%{http_code}' --max-time 15 "${BASE_URL}${path}" || echo 000)"
  if [[ "$status" != "$want" ]]; then
    bad "GET ${path} → ${status} (want ${want})"
  elif [[ -n "$needle" ]] && ! grep -qF -- "$needle" "$body"; then
    bad "GET ${path} → ${status} but body lacks '${needle}'"
  else
    pass "GET ${path} → ${status}"
  fi
  rm -f "$body"
}

# gql NAME QUERY JQ_FILTER — JQ_FILTER must print a non-empty, non-null value.
gql() {
  local name="$1" q="$2" filter="$3" out val
  out="$(curl -sS --max-time 15 -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg q "$q" '{query: $q}')" "${BASE_URL}/graphql" || true)"
  val="$(jq -r "$filter // empty" <<<"$out" 2>/dev/null || true)"
  if [[ -z "$val" ]] || jq -e '.errors' <<<"$out" >/dev/null 2>&1; then
    bad "graphql ${name}: ${out:0:200}"
  else
    pass "graphql ${name} → ${val}"
  fi
}

command -v jq >/dev/null || { echo "smoke.sh needs jq" >&2; exit 2; }

echo "Smoke-testing ${BASE_URL}"

check_page /health 200
check_page / 200 "MONI CAFE"
check_page /coffees 200
check_page /shops 200
check_page /map 200
check_page /shops/this-shop-does-not-exist 404
check_page /coffees/00000000-0000-0000-0000-000000000000 404

gql shops        '{ shops { total } }'                    '.data.shops.total'
gql shopsForMap  '{ shopsForMap { id lat lng } }'         '.data.shopsForMap | length'
gql coffees      '{ coffees { total } }'                  '.data.coffees.total'
gql popular      '{ popularCoffees(limit: 4) { id } }'    '.data.popularCoffees | length'
gql origins      '{ originCountries { id } }'             '.data.originCountries | length'

# Follow a real coffee + shop through to their detail pages.
coffee_id="$(curl -sS --max-time 15 -H 'Content-Type: application/json' \
  -d '{"query":"{ coffees(limit: 1) { nodes { id shop { slug } } } }"}' "${BASE_URL}/graphql" \
  | jq -r '.data.coffees.nodes[0] | "\(.id) \(.shop.slug)"' 2>/dev/null || true)"
if [[ -n "$coffee_id" && "$coffee_id" != "null null" ]]; then
  check_page "/coffees/${coffee_id% *}" 200
  check_page "/shops/${coffee_id#* }" 200
else
  bad "no published coffee to follow (is the demo seed loaded? SEED_DEMO_DATA=true)"
fi

if (( fail )); then
  echo "Smoke test FAILED"
  exit 1
fi
echo "Smoke test passed"
