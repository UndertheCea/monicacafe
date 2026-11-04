#!/bin/sh
# Smoke-test the Docker demo: every Stage 1 route must answer through nginx.
#
#   docker compose up -d --wait && ./scripts/smoke.sh
#   BASE_URL=http://localhost:3000 ./scripts/smoke.sh   # against `next start`
#
# Exits non-zero on the first failure.
set -eu

BASE_URL="${BASE_URL:-http://localhost}"
GRAPHQL_URL="${GRAPHQL_URL:-$BASE_URL/graphql}"
fail=0

check() { # check <path> <expected status> [must-contain]
  path=$1 want=$2 needle=${3:-}
  body=$(mktemp)
  got=$(curl -sS -o "$body" -w '%{http_code}' "$BASE_URL$path" || echo 000)
  if [ "$got" != "$want" ]; then
    echo "FAIL $path → $got (want $want)"; fail=1
  elif [ -n "$needle" ] && ! grep -q "$needle" "$body"; then
    echo "FAIL $path → $got but body lacks '$needle'"; fail=1
  else
    echo "ok   $path → $got"
  fi
  rm -f "$body"
}

check /                 200 "MONI CAFE"
check /coffees          200
check /shops            200
check /map              200
check /shops/__nope__   404

if [ "$BASE_URL" = "http://localhost" ]; then
  check /health 200
fi

# GraphQL: the map query must return at least one pin with the seed data.
resp=$(curl -sS -H 'Content-Type: application/json' \
  -d '{"query":"{ shopsForMap { slug lat lng } popularCoffees(limit: 1) { id } }"}' \
  "$GRAPHQL_URL" || true)
case "$resp" in
  *'"errors"'*|'') echo "FAIL graphql → $resp"; fail=1 ;;
  *'"slug"'*) echo "ok   graphql shopsForMap" ;;
  *) echo "WARN graphql shopsForMap returned no pins (SEED_DEMO_DATA=false?)" ;;
esac

[ "$fail" -eq 0 ] && echo "smoke: all checks passed"
exit "$fail"
