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

for path in / /coffees /shops /map /login /register /account /dashboard /dashboard/coffees/new; do
  check_status "$BASE_URL$path" 200
done
check_status "$BASE_URL/shops/__no-such-shop__" 404

# Content-Security-Policy from frontend/proxy.ts: a fresh nonce per request,
# and Next puts that same nonce on its own <script> tags.
csp_page=$(curl -s -D - --max-time 15 "$BASE_URL/") || csp_page=""
csp_nonce=$(grep -i '^content-security-policy:' <<<"$csp_page" | grep -o "'nonce-[^']*'" | head -1 | sed "s/'nonce-//; s/'//" || true)
csp_again=$(curl -s -D - -o /dev/null --max-time 15 "$BASE_URL/" | grep -i '^content-security-policy:' | grep -o "'nonce-[^']*'" | head -1 || true)
if [[ -n "$csp_nonce" && "$csp_page" == *"nonce=\"$csp_nonce\""* && "$csp_again" != "'nonce-$csp_nonce'" ]]; then
  echo "ok   CSP nonce on / (per request, on Next's scripts)"
else
  echo "FAIL CSP nonce: header nonce '${csp_nonce}', second request '${csp_again}'"; fail=1
fi

# Response hardening (#100): no X-Powered-By, a Permissions-Policy on pages,
# nosniff on API responses.
page_hdrs=$(grep -i '^\(x-powered-by\|permissions-policy\):' <<<"$csp_page" | tr -d '\r' || true)
if grep -qi '^x-powered-by:' <<<"$page_hdrs"; then
  echo "FAIL page exposes $(grep -i '^x-powered-by:' <<<"$page_hdrs")"; fail=1
elif grep -qi '^permissions-policy:.*camera=().*geolocation=()' <<<"$page_hdrs"; then
  echo "ok   page headers: Permissions-Policy, no X-Powered-By"
else
  echo "FAIL Permissions-Policy missing on /"; fail=1
fi
api_hdrs=$(curl -s -o /dev/null -D - --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ __typename }"}' || true)
if grep -qi '^x-content-type-options: *nosniff' <<<"$api_hdrs"; then echo "ok   API sends nosniff"; else echo "FAIL API lacks X-Content-Type-Options: nosniff"; fail=1; fi

# sitemap.xml lists the seeded shops and coffees with <lastmod> (#80); robots.txt points at it.
sitemap=$(curl -s --max-time 15 "$BASE_URL/sitemap.xml") || sitemap=""
if [[ "$sitemap" == *"<urlset"* && "$sitemap" == *"/shops/"* && "$sitemap" == *"/coffees/"* && "$sitemap" == *"<lastmod>"* ]]; then
  echo "ok   sitemap.xml ($(grep -o '<loc>' <<<"$sitemap" | wc -l) URLs)"
else
  echo "FAIL sitemap.xml: ${sitemap:0:200}"; fail=1
fi
# Detail pages (#41): one seeded coffee and shop from the sitemap render with
# their name and share-card tags (#40); unknown ids / pages are branded 404s.
html_escape() { sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g' <<<"$1"; }
detail_check() { # path graphql-query
  local html name
  html=$(curl -s --max-time 15 -w '\n%{http_code}' "$BASE_URL$1") || html="000"
  name=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' -d "$2" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [[ "${html##*$'\n'}" == "200" && -n "$name" && "$html" == *"$(html_escape "$name")"* \
        && "$html" == *'property="og:url"'* && "$html" == *'rel="canonical"'* ]]; then
    echo "ok   200 $1 (\"$name\", og + canonical)"
  else
    echo "FAIL $1 → ${html##*$'\n'}, name '$name', og:url $([[ "$html" == *'og:url'* ]] && echo yes || echo no)"; fail=1
  fi
}
coffee_path=$(grep -o '<loc>[^<]*/coffees/[0-9a-f-]\{36\}</loc>' <<<"$sitemap" | head -1 | sed 's#<loc>[a-z]*://[^/]*##; s#</loc>##' || true)
shop_path=$(grep -o '<loc>[^<]*/shops/[a-z0-9-]*</loc>' <<<"$sitemap" | head -1 | sed 's#<loc>[a-z]*://[^/]*##; s#</loc>##' || true)
if [[ -z "$coffee_path" || -z "$shop_path" ]]; then
  echo "FAIL detail pages: no coffee / shop URL in sitemap.xml"; fail=1
else
  detail_check "$coffee_path" "$(printf '{"query":"{ coffee(id: \\"%s\\") { name } }"}' "${coffee_path##*/}")"
  if curl -s --max-time 15 "$BASE_URL$coffee_path" | grep -q '<script type="application/ld+json"[^>]*>{"@context":"https://schema.org","@type":"Product"'; then
    echo "ok   Product JSON-LD on $coffee_path"
  else
    echo "FAIL no Product JSON-LD on $coffee_path"; fail=1
  fi
  detail_check "$shop_path" "$(printf '{"query":"{ shop(slug: \\"%s\\") { name } }"}' "${shop_path##*/}")"
fi
check_status "$BASE_URL/coffees/00000000-0000-4000-8000-00000000dead" 404
check_status "$BASE_URL/__no-such-page__" 404

# nginx (#64): text responses are gzipped when the client asks; the Server
# header carries no version. Skipped when BASE_URL bypasses nginx.
if [[ "$BASE_URL" == "$API_URL" ]]; then
  gz_check() { # label curl-args...
    local label=$1 hdrs; shift
    hdrs=$(curl -s -o /dev/null -D - --max-time 15 -H 'Accept-Encoding: gzip' "$@") || hdrs=""
    if grep -qi '^content-encoding: gzip' <<<"$hdrs" && grep -qi '^vary:.*accept-encoding' <<<"$hdrs"; then
      echo "ok   gzip $label"
    else
      echo "FAIL $label not gzipped: $(grep -i '^content-\(encoding\|type\)' <<<"$hdrs" | tr -d '\r' | tr '\n' ' ')"; fail=1
    fi
  }
  gz_check "/coffees (HTML)" "$BASE_URL/coffees"
  gz_check "/graphql (JSON)" "$BASE_URL/graphql" -H 'Content-Type: application/json' \
    -d '{"query":"{ originCountries { id nameEn nameZh region } processingMethods { id nameEn nameZh description } }"}'
  server=$(curl -s -o /dev/null -D - --max-time 15 "$BASE_URL/robots.txt" | grep -i '^server:' | tr -d '\r' || true)
  if [[ "$server" =~ [0-9] ]]; then echo "FAIL server version exposed: $server"; fail=1; else echo "ok   no server version (${server:-no Server header})"; fi
fi

robots=$(curl -s --max-time 15 "$BASE_URL/robots.txt") || robots=""
if [[ "$robots" == *"Sitemap:"*"/sitemap.xml"* ]]; then echo "ok   robots.txt → sitemap"; else echo "FAIL robots.txt: ${robots:0:200}"; fail=1; fi

# Auth BFF: no refresh cookie → 401 (proves the route handler is reachable).
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$BASE_URL/api/auth/refresh") || code="000"
if [[ "$code" == "401" ]]; then echo "ok   401 POST /api/auth/refresh (no session)"; else echo "FAIL POST /api/auth/refresh → $code (want 401)"; fail=1; fi
check_status "$API_URL/health" 200

# Auth BFF through the proxy: register sets the httpOnly refresh cookie scoped
# to /api/auth; refresh trades it for a new one; replaying the previous cookie
# right away (an aborted refresh on fast navigation, #24) still works; after
# logout the cookie is cleared and refresh is refused.
jar=$(mktemp); old_jar=$(mktemp); trap 'rm -f "$jar" "$old_jar"' EXIT
bff() { # action [json]
  curl -s -o /dev/null -w '%{http_code}' --max-time 15 -b "$jar" -c "$jar" -X POST \
    -H 'Content-Type: application/json' -d "${2:-{\}}" "$BASE_URL/api/auth/$1" || echo 000
}
cookie() { awk '$6 == "mc_rt" { print $3 " " $7 }' "$1" | tail -1; }
bff_run="smokebff$(date +%s)$RANDOM"
reg=$(bff register "$(printf '{"email":"%s@example.com","password":"smoke-test-pw","displayName":"Smoke"}' "$bff_run")")
first=$(cookie "$jar"); cp "$jar" "$old_jar"
ref=$(bff refresh); second=$(cookie "$jar")
cp "$old_jar" "$jar"; replay=$(bff refresh); third=$(cookie "$jar")
if [[ "$reg" == "200" && "${first%% *}" == "/api/auth" && "$ref" == "200" && -n "$second" && "$second" != "$first" \
      && "$replay" == "200" && -n "$third" && "$third" != "$first" ]]; then
  echo "ok   auth cookie: register → refresh rotates → replay within grace (via $BASE_URL)"
else
  echo "FAIL auth cookie: register $reg, cookie '${first%% *}', refresh $ref, replay $replay"; fail=1
fi
# Logout (#74) ends only this browser's session, server-side, with no access
# token: the saved pre-logout cookie is refused, a second session still refreshes.
other_jar=$(mktemp); trap 'rm -f "$jar" "$old_jar" "$other_jar"' EXIT
curl -s -o /dev/null --max-time 15 -c "$other_jar" -X POST -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s@example.com","password":"smoke-test-pw"}' "$bff_run")" "$BASE_URL/api/auth/login" || true
cp "$jar" "$old_jar"
bff logout >/dev/null
out=$(bff refresh)
cp "$old_jar" "$jar"; revoked=$(bff refresh)
cp "$other_jar" "$jar"; kept=$(bff refresh)
if [[ "$out" == "401" && "$revoked" == "401" && "$kept" == "200" ]]; then
  echo "ok   logout: cookie cleared, old token refused, other session kept"
else
  echo "FAIL logout: refresh $out (want 401), old cookie $revoked (want 401), other session $kept (want 200)"; fail=1
fi

# Change password through the BFF (#33): log in again, change it with the
# access token; the response sets a new cookie that refreshes, and the
# pre-change cookie is refused.
login_body=$(curl -s --max-time 15 -b "$jar" -c "$jar" -X POST -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s@example.com","password":"smoke-test-pw"}' "$bff_run")" "$BASE_URL/api/auth/login" || true)
access=$(grep -o '"accessToken":"[^"]*"' <<<"$login_body" | cut -d'"' -f4 || true)
cp "$jar" "$old_jar"; before=$(cookie "$jar")
pw=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -b "$jar" -c "$jar" -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $access" \
  -d '{"currentPassword":"smoke-test-pw","newPassword":"smoke-test-pw-2"}' "$BASE_URL/api/auth/password" || echo 000)
after=$(cookie "$jar"); new_jar=$(mktemp); cp "$jar" "$new_jar"
cp "$old_jar" "$jar"; stale=$(bff refresh)
cp "$new_jar" "$jar"; fresh=$(bff refresh); rm -f "$new_jar"
if [[ -n "$access" && "$pw" == "200" && -n "$after" && "$after" != "$before" && "$stale" == "401" && "$fresh" == "200" ]]; then
  echo "ok   change password via BFF: new cookie works, old one refused"
else
  echo "FAIL change password: login token '${access:0:8}', /api/auth/password $pw, stale refresh $stale, new refresh $fresh"; fail=1
fi

# Delete account through the BFF (#91): refused without an access token; with
# one (from a refresh on the current cookie) the account goes, the cookie is
# cleared, and neither refresh nor login works afterwards.
nosess=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST -H 'Content-Type: application/json' \
  -d '{"password":"x"}' "$BASE_URL/api/auth/delete-account" || echo 000)
ref_body=$(curl -s --max-time 15 -b "$jar" -c "$jar" -X POST "$BASE_URL/api/auth/refresh" || true)
access=$(grep -o '"accessToken":"[^"]*"' <<<"$ref_body" | cut -d'"' -f4 || true)
del=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -b "$jar" -c "$jar" -X POST \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $access" \
  -d '{"password":"smoke-test-pw-2"}' "$BASE_URL/api/auth/delete-account" || echo 000)
gone_cookie=$(cookie "$jar")
gone_refresh=$(bff refresh)
gone_login=$(bff login "$(printf '{"email":"%s@example.com","password":"smoke-test-pw-2"}' "$bff_run")")
if [[ "$nosess" == "401" && -n "$access" && "$del" == "200" && -z "$gone_cookie" && "$gone_refresh" == "401" && "$gone_login" == "401" ]]; then
  echo "ok   delete account via BFF: cookie cleared, refresh + login refused"
else
  echo "FAIL delete account: no session $nosess (want 401), token '${access:0:8}', delete $del, cookie '$gone_cookie', refresh $gone_refresh, login $gone_login"; fail=1
fi

# Auth rate limit (#27): wrong-password logins for one email are refused with
# 429 + Retry-After once RATE_LIMIT_LOGIN_EMAIL's burst (default 10) is spent.
rl_email="smokerl$(date +%s)$RANDOM@example.com"; rl_code=""; rl_n=0
while (( rl_n < ${SMOKE_LOGIN_BURST:-10} + 1 )); do
  rl_n=$((rl_n + 1))
  rl_code=$(bff login "$(printf '{"email":"%s","password":"wrong-password"}' "$rl_email")")
  [[ "$rl_code" == "429" ]] && break
done
rl_headers=$(curl -s -D - -o /dev/null --max-time 15 -X POST -H 'Content-Type: application/json' \
  -d "$(printf '{"email":"%s","password":"wrong-password"}' "$rl_email")" "$BASE_URL/api/auth/login" || true)
if [[ "$rl_code" == "429" ]] && grep -qi '^retry-after: [0-9]' <<<"$rl_headers"; then
  echo "ok   429 login after $rl_n attempts for one email (Retry-After set)"
else
  echo "FAIL login rate limit: attempt $rl_n → $rl_code, headers: $(head -1 <<<"$rl_headers")"; fail=1
fi

body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ shopsForMap { slug lat lng } popularCoffees(limit: 1) { id } }"}') || body=""
pins=$(grep -o '"lat":[0-9.-]*' <<<"$body" | wc -l || true)
coffees=$(grep -o '"id":"' <<<"$body" | wc -l || true)
if [[ "$body" == *'"errors"'* || "$pins" -eq 0 || "$coffees" -eq 0 ]]; then
  echo "FAIL graphql: expected map pins and popular coffees, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql ($pins map pins, popular coffees present)"
fi

# Keyword search (CoffeeFilter.search): the seeded 耶加雪菲 coffee is found by
# a zh word plus its shop's English name, and /coffees?q= renders the results.
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ coffees(filter: { search: \"耶加雪菲 dawn\" }) { total nodes { id } } }"}') || body=""
if [[ "$body" == *'"errors"'* || "$body" != *'"id":"00000000-0000-4000-8000-000000000201"'* ]]; then
  echo "FAIL search: expected the seeded 耶加雪菲 coffee, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql search"
fi
if curl -s --max-time 15 "$BASE_URL/coffees?q=%E8%80%B6%E5%8A%A0%E9%9B%AA%E8%8F%B2" | grep -q '/coffees/00000000-0000-4000-8000-000000000201'; then
  echo "ok   /coffees?q= lists the match"
else
  echo "FAIL /coffees?q= did not list the seeded match"; fail=1
fi

# Shop search (#75, #76) and in-shop search + roast (#77, #78): /shops?q=晨光
# lists the seeded Dawn Roastery; its page with q=耶加雪菲&roast=LIGHT lists
# the seeded coffee, and roast=DARK alone shows the "no matches" state.
if curl -s --max-time 15 "$BASE_URL/shops?q=%E6%99%A8%E5%85%89" | grep -q '/shops/demo-roastery'; then
  echo "ok   /shops?q= lists the match"
else
  echo "FAIL /shops?q= should list /shops/demo-roastery"; fail=1
fi
in_shop=$(curl -s --max-time 15 "$BASE_URL/shops/demo-roastery?q=%E8%80%B6%E5%8A%A0%E9%9B%AA%E8%8F%B2&roast=LIGHT") || in_shop=""
dark=$(curl -s --max-time 15 "$BASE_URL/shops/demo-roastery?roast=DARK") || dark=""
if [[ "$in_shop" == *'/coffees/00000000-0000-4000-8000-000000000201'* && "$dark" != *'/coffees/00000000-0000-4000-8000-0000000002'* ]]; then
  echo "ok   shop page search + roast filter"
else
  echo "FAIL shop page filter: search+LIGHT should list the 耶加雪菲 coffee, DARK should list none of the shop's"; fail=1
fi

# "You may also like" (#83, #84): the seeded 耶加雪菲 page links the seeded Kenya
# washed coffee from another shop (same process; only reachable via Coffee.similar).
if curl -s --max-time 15 "$BASE_URL/coffees/00000000-0000-4000-8000-000000000201" | grep -q '/coffees/00000000-0000-4000-8000-000000000204'; then
  echo "ok   coffee page: you may also like"
else
  echo "FAIL coffee page: expected a similar coffee from another shop (…0204)"; fail=1
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
