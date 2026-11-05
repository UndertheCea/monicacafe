#!/usr/bin/env bash
# Smoke-test the Stage 1 demo after `docker compose up`:
#
#   ./scripts/smoke.sh                       # via nginx on http://localhost
#   BASE_URL=http://localhost:3000 API_URL=http://localhost:4000 ./scripts/smoke.sh
#
# Checks every demo route returns 200 (and an unknown route 404), that the
# auth endpoints answer, that the API answers health + GraphQL, and that the
# seed produced map pins and coffees, and that image uploads round-trip
# through nginx to the S3 store.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
API_URL="${API_URL:-$BASE_URL}"
fail=0

check_status() { # path expected
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1") || code="000"
  if [[ "$code" == "$2" ]]; then echo "ok   $2 $1"; else echo "FAIL $1 → $code (want $2)"; fail=1; fi
}

for path in / /coffees /shops /map /login /register /dashboard /dashboard/coffees/new; do
  check_status "$BASE_URL$path" 200
done
check_status "$BASE_URL/shops/__no-such-shop__" 404

# Auth BFF: no refresh cookie → 401 (proves the route handler is reachable).
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$BASE_URL/api/auth/refresh") || code="000"
if [[ "$code" == "401" ]]; then echo "ok   401 POST /api/auth/refresh (no session)"; else echo "FAIL POST /api/auth/refresh → $code (want 401)"; fail=1; fi
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

# ── Image storage (S3 store behind nginx at /media/) ────────────────────────
# A missing object must come back from the store as 404 (not nginx's 502/404 page),
# and listing the bucket must be refused.
check_status "$BASE_URL/media/shops/__no-such-image__.png" 404
check_status "$BASE_URL/media/" 403

# End to end: a throwaway seller opens a shop, gets a presigned URL, uploads a
# file through nginx and reads it back from the public URL. This leaves a
# "smoke…" user and shop behind (fine for a dev stack; SMOKE_UPLOAD=0 skips it).
gql() { # token json-body
  curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' ${1:+-H "Authorization: Bearer $1"} -d "$2"
}
field() { grep -o "\"$1\":\"[^\"]*\"" | head -1 | cut -d'"' -f4; }
if [[ "${SMOKE_UPLOAD:-1}" != "0" ]]; then
  run="smoke$(date +%s)$RANDOM"
  token=$(gql "" "$(printf '{"query":"mutation($in: RegisterInput!) { register(input: $in) { accessToken } }","variables":{"in":{"email":"%s@example.com","password":"smoke-test-pw","displayName":"Smoke"}}}' "$run")" | field accessToken)
  shop_id=$(gql "$token" "$(printf '{"query":"mutation($in: CreateShopInput!) { createShop(input: $in) { id } }","variables":{"in":{"slug":"%s","name":"Smoke test","description":"","city":"Taipei"}}}' "$run")" | field id)
  payload="smoke-image-$run"
  size=${#payload}
  upload=$(gql "$token" "$(printf '{"query":"mutation($in: ImageUploadInput!) { createImageUpload(input: $in) { uploadUrl publicUrl } }","variables":{"in":{"kind":"SHOP_LOGO","targetId":"%s","contentType":"image/png","byteSize":%d}}}' "$shop_id" "$size")")
  upload_url=$(field uploadUrl <<<"$upload" | sed 's/\\u0026/\&/g')
  public_url=$(field publicUrl <<<"$upload")
  if [[ -z "$token" || -z "$shop_id" || -z "$upload_url" ]]; then
    echo "FAIL upload: couldn't get a presigned URL: ${upload:0:300}"; fail=1
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X PUT -H 'Content-Type: image/png' --data-binary "$payload" "$upload_url") || code="000"
    got=$(curl -s --max-time 15 "$public_url") || got=""
    if [[ "$code" == "200" && "$got" == "$payload" ]]; then
      echo "ok   upload: presigned PUT + public GET via /media/"
    else
      echo "FAIL upload: PUT → $code, GET $public_url → ${got:0:100}"; fail=1
    fi
  fi
fi

if [[ $fail -ne 0 ]]; then echo "smoke test FAILED"; exit 1; fi
echo "smoke test passed"
