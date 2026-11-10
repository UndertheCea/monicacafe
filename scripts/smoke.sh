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

for path in / /coffees /shops /map /menu /login /register /account /dashboard /dashboard/coffees/new; do
  check_status "$BASE_URL$path" 200
done
check_status "$BASE_URL/shops/__no-such-shop__" 404

# No-JavaScript rendering (#156): list pages arrive complete, not streamed into
# hidden placeholders behind a loading skeleton.
for path in /coffees /shops; do
  page=$(curl -s --max-time 15 "$BASE_URL$path") || page=""
  if [[ -n "$page" && "$page" != *'<div hidden id="S:'* && "$page" == *'<article'* ]]; then
    echo "ok   $path renders its list without JavaScript"
  else
    echo "FAIL $path should render its list in the HTML, not in a hidden streamed placeholder"; fail=1
  fi
done

# Navigation drawer (#175, every width since #185): the server-rendered header's menu button is a link
# to /menu (the no-JavaScript fallback), which lists the drawer's links.
home=$(curl -s --max-time 15 "$BASE_URL/") || home=""
menu=$(curl -s --max-time 15 "$BASE_URL/menu") || menu=""
if [[ "$home" == *'href="/menu"'* && "$menu" == *'href="/register"'* && "$menu" == *'href="/map"'* \
      && "$menu" == *'noindex'* ]]; then
  echo "ok   header menu link → /menu with the drawer's links (noindex)"
else
  echo "FAIL the header should link to /menu, and /menu should list the menu (and be noindex)"; fail=1
fi

# Site icons (#114): served as images, not the 404 page; the home page links them.
icon_check() { # path content-type-prefix
  local ct
  ct=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 15 "$BASE_URL$1") || ct="000"
  if [[ "$ct" == "200 $2"* ]]; then echo "ok   icon $1 ($ct)"; else echo "FAIL icon $1 → $ct (want 200 $2)"; fail=1; fi
}
icon_check /favicon.ico image/
icon_check /icon.svg image/svg+xml
icon_check /apple-icon.png image/png

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
# Provenance search (#120): the seeded Yirgacheffe lists region "Gedeo, Yirgacheffe".
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ coffees(filter: { search: \"gedeo\" }) { nodes { id region altitudeMinM altitudeMaxM } } }"}') || body=""
if [[ "$body" == *'"errors"'* || "$body" != *'"id":"00000000-0000-4000-8000-000000000201","region":"Gedeo, Yirgacheffe","altitudeMinM":1800,"altitudeMaxM":2100'* ]]; then
  echo "FAIL provenance search: expected the seeded Yirgacheffe by region, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql provenance search"
fi
if curl -s --max-time 15 "$BASE_URL/coffees?q=%E8%80%B6%E5%8A%A0%E9%9B%AA%E8%8F%B2" | grep -q '/coffees/00000000-0000-4000-8000-000000000201'; then
  echo "ok   /coffees?q= lists the match"
else
  echo "FAIL /coffees?q= did not list the seeded match"; fail=1
fi

# Brew method (#122–#127): the seeded espresso blend (206) and the omni
# Huila (203) match ESPRESSO; the filter-only Yirgacheffe (201) doesn't.
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ coffees(filter: { brewMethod: ESPRESSO }, limit: 100) { nodes { id brewMethod } } }"}') || body=""
if [[ "$body" == *'"errors"'* || "$body" != *'"id":"00000000-0000-4000-8000-000000000206","brewMethod":"ESPRESSO"'* \
      || "$body" != *'"id":"00000000-0000-4000-8000-000000000203","brewMethod":"OMNI"'* || "$body" == *'"brewMethod":"FILTER"'* ]]; then
  echo "FAIL brew filter: expected espresso + omni coffees only, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql brew method filter"
fi

# Harvest year (#129–#134): the seed dates crops relative to this year, so
# minHarvestYear = last year lists the Yirgacheffe (201, last year's crop) and
# not the older Huila (203) or the unset blend (206).
recent=$(( $(TZ=Asia/Taipei date +%Y) - 1 ))
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d "{\"query\":\"{ coffees(filter: { minHarvestYear: $recent }, limit: 100) { nodes { id harvestYear } } }\"}") || body=""
if [[ "$body" == *'"errors"'* || "$body" != *"\"id\":\"00000000-0000-4000-8000-000000000201\",\"harvestYear\":$recent"* \
      || "$body" == *'00000000-0000-4000-8000-000000000203'* || "$body" == *'00000000-0000-4000-8000-000000000206'* ]]; then
  echo "FAIL harvest filter: expected recent crops only, got: ${body:0:300}"; fail=1
else
  echo "ok   graphql harvest year filter"
fi

# Cup profile removed (owner's answer on #176, #189): the coffee page no longer
# shows the scales.
page=$(curl -s --max-time 15 "$BASE_URL/coffees/00000000-0000-4000-8000-000000000201") || page=""
if [[ -n "$page" && "$page" != *'酸度'* && "$page" != *'Acidity'* ]]; then
  echo "ok   coffee page has no cup profile"
else
  echo "FAIL coffee page should not show a cup profile (酸度 / Acidity)"; fail=1
fi

# High-grown (#147, API only): 1,500 m+ leaves out the 1,000–1,400 m blend and
# coffees are judged by the top of their range.
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ high: coffees(filter: { minAltitudeM: 1500 }, limit: 100) { nodes { id } } }"}') || body=""
high=$(echo "$body" | grep -o '"high":{"nodes":\[[^]]*\]') || high=""
if [[ "$body" == *'"errors"'* || "$high" != *'000000000201'* || "$high" != *'000000000205'* || "$high" == *'000000000206'* ]]; then
  echo "FAIL altitude filter: got ${body:0:400}"; fail=1
else
  echo "ok   graphql altitude filter"
fi
# /coffees no longer offers these filters (owner, #166, #167): old links show the
# unfiltered list, the sidebar has no such fields, and cards don't show the
# brew method (the coffee page still does).
page=$(curl -s --max-time 15 "$BASE_URL/coffees?brew=espresso&harvest=recent&acidity=low&sweet=high&body=light&altitude=high&roast=dark&flavor=zzz") || page=""
if [[ "$page" == *'/coffees/00000000-0000-4000-8000-000000000201'* && "$page" == *'/coffees/00000000-0000-4000-8000-000000000206'* \
      && "$page" != *'name="brew"'* && "$page" != *'name="roast"'* && "$page" != *'name="acidity"'* && "$page" != *'name="body"'* \
      && "$page" != *'name="harvest"'* && "$page" != *'name="sweet"'* && "$page" != *'name="altitude"'* && "$page" != *'name="flavor"'* \
      && "$page" != *' · 手沖'* && "$page" != *' · Filter<'* ]]; then
  echo "ok   /coffees ignores the removed filters and cards drop the brew method"
else
  echo "FAIL /coffees with old roast / brew / cup-profile params should list everything, without those fields or a brew tag"; fail=1
fi

# A malformed id (#179): a truncated or hand-edited link shows the list, not the error page.
page=$(curl -s --max-time 15 "$BASE_URL/coffees?origin=not-a-uuid&variety=x&process=123") || page=""
if [[ "$page" == *'/coffees/00000000-0000-4000-8000-000000000201'* && "$page" != *'無法載入資料'* && "$page" != *'Couldn'* ]]; then
  echo "ok   /coffees ignores malformed origin / variety / process ids"
else
  echo "FAIL /coffees?origin=not-a-uuid should list the coffees, not the error state"; fail=1
fi

# A backwards price range (#180) is read the right way round, not an error.
page=$(curl -s --max-time 15 "$BASE_URL/coffees?min=900&max=100") || page=""
if [[ "$page" == *'/coffees/00000000-0000-4000-8000-000000000201'* && "$page" != *'無法載入資料'* && "$page" != *'Couldn'* \
      && "$page" == *'name="min"'*'value="100"'* ]]; then
  echo "ok   /coffees?min=900&max=100 lists NT\$100–900"
else
  echo "FAIL /coffees?min=900&max=100 should list coffees priced 100–900, not the error state"; fail=1
fi

# Filter-option counts (#150, #151): the seed has a published Ethiopian coffee
# and nothing from Rwanda, so /coffees offers Ethiopia (with its count) and
# leaves Rwanda out of the origin select.
body=$(curl -s --max-time 15 "$API_URL/graphql" -H 'Content-Type: application/json' \
  -d '{"query":"{ originCountries { nameEn coffeeCount } coffeeVarieties { coffeeCount } processingMethods { coffeeCount } }"}') || body=""
if [[ "$body" != *'"errors"'* && "$body" =~ \"nameEn\":\"Ethiopia\",\"coffeeCount\":[1-9] && "$body" == *'"nameEn":"Rwanda","coffeeCount":0'* ]]; then
  echo "ok   graphql coffeeCount on origins / varieties / processes"
else
  echo "FAIL coffeeCount: Ethiopia should be ≥ 1 and Rwanda 0, got ${body:0:300}"; fail=1
fi
page=$(curl -s --max-time 15 "$BASE_URL/coffees") || page=""
if [[ "$page" == *'Ethiopia（'* || "$page" == *'Ethiopia ('* ]] && [[ "$page" != *'Rwanda'* ]]; then
  echo "ok   /coffees origin select lists only origins with coffees, with counts"
else
  echo "FAIL /coffees origin select should list Ethiopia with a count and leave out Rwanda"; fail=1
fi

# Active-filter chips + phone toggle (#152–#154): each chip links to the list
# without its filter; the toggle counts the active filters.
page=$(curl -s --max-time 15 "$BASE_URL/coffees?min=300&instock=1") || page=""
if [[ "$page" == *'href="/coffees?instock=1"'* && "$page" == *'href="/coffees?min=300"'* \
      && ( "$page" == *'移除篩選'* || "$page" == *'Remove filter'* ) \
      && ( "$page" == *'篩選（2）'* || "$page" == *'Filters (2)'* ) ]]; then
  echo "ok   /coffees shows removable filter chips and \"Filters (2)\""
else
  echo "FAIL /coffees?min=300&instock=1 should show a chip per filter and a Filters (2) toggle"; fail=1
fi

# Shop search (#75, #76): /shops?q=晨光 lists the seeded Dawn Roastery.
if curl -s --max-time 15 "$BASE_URL/shops?q=%E6%99%A8%E5%85%89" | grep -q '/shops/demo-roastery'; then
  echo "ok   /shops?q= lists the match"
else
  echo "FAIL /shops?q= should list /shops/demo-roastery"; fail=1
fi
# Shop pages have no buyer search, filters or sort (#160): old filter links
# still return the full lineup, and there is no search box or sort select.
dark=$(curl -s --max-time 15 "$BASE_URL/shops/demo-roastery?roast=DARK&q=zzz&sort=price_asc") || dark=""
if [[ "$dark" == *'/coffees/00000000-0000-4000-8000-000000000201'* && "$dark" == *'/coffees/00000000-0000-4000-8000-000000000202'* \
      && "$dark" != *'name="sort"'* && "$dark" != *'在這間店搜尋'* && "$dark" != *'Search this shop'* && "$dark" != *'name="roast"'* ]]; then
  echo "ok   shop page ignores old filter params and shows no buyer controls"
else
  echo "FAIL /shops/demo-roastery?roast=DARK&q=zzz should list the whole lineup with no search / filter / sort form"; fail=1
fi

# Sold-out archive (#163): the seeded 古吉 (its only option has no stock) is
# listed only after the archive heading; the in-stock 耶加雪菲 before it. (The
# RSC payload at the end of the HTML repeats every link, so "after" can't be
# checked for absence.)
shop=$(curl -s --max-time 15 "$BASE_URL/shops/demo-roastery") || shop=""
heading='id="shop-archive"'
before=${shop%%"$heading"*}
after=${shop#*"$heading"}
if [[ "$shop" == *"$heading"* && ( "$after" == *'已售完 · 封存'* || "$after" == *'Sold out · Archive'* ) \
      && "$after" == *'/coffees/00000000-0000-4000-8000-000000000207'* && "$before" != *'/coffees/00000000-0000-4000-8000-000000000207'* \
      && "$before" == *'/coffees/00000000-0000-4000-8000-000000000201'* ]]; then
  echo "ok   shop page lists the sold-out coffee under the archive heading"
else
  echo "FAIL /shops/demo-roastery should list coffee 207 only under 已售完 · 封存 and 201 above it"; fail=1
fi

# Most followed (#107): the seed gives 府城焙煎所 two followers, so it is the
# first shop link on /shops?sort=followers and its card shows the count.
followed=$(curl -s --max-time 15 "$BASE_URL/shops?sort=followers") || followed=""
first_shop=$(grep -o 'href="/shops/[a-z0-9-]*"' <<<"$followed" | grep -v 'href="/shops/"' | head -1 || true)
if [[ "$first_shop" == 'href="/shops/fucheng-roasting"' && "$followed" == *'2 人追蹤'* ]]; then
  echo "ok   /shops?sort=followers puts the most-followed shop first"
else
  echo "FAIL /shops?sort=followers: first shop was ${first_shop:-none}, want fucheng-roasting with 2 人追蹤"; fail=1
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
