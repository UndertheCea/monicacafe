package graph_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// The two queries from #207 are refused by the real handler before any
// resolver runs, and ordinary queries still work under the same limits.
func TestAbusiveQueriesAreRefused(t *testing.T) {
	url, _ := newTestServer(t)
	anon := &gqlClient{t: t, url: url}

	refused := map[string]string{
		"similar × similar × similar over 100 coffees": `{coffees(limit:100){nodes{similar(limit:12){similar(limit:12){similar(limit:12){id}}}}}}`,
		"similar of similar on one coffee":             `{coffees(limit:1){nodes{similar{similar{id}}}}}`,
		"similar for a full page":                      `{coffees(limit:100){nodes{similar(limit:12){id}}}}`,
		"comments × coffee × comments":                 `{coffees(limit:1){nodes{comments(limit:100){coffee{comments(limit:100){coffee{comments(limit:100){id}}}}}}}}`,
		"nine levels deep":                             `{coffees(limit:1){nodes{shop{coffees(limit:1){nodes{shop{coffees(limit:1){nodes{shop{id}}}}}}}}}}`,
	}
	for name, q := range refused {
		t.Run(name, func(t *testing.T) {
			r := anon.do(q, nil, nil)
			if len(r.Errors) == 0 {
				t.Fatal("the query ran")
			}
			if code := r.Errors[0].Extensions["code"]; code != graph.CodeQueryTooComplex {
				t.Fatalf("code = %v (%s), want %s", code, r.Errors[0].Message, graph.CodeQueryTooComplex)
			}
			if string(r.Data) != "" && string(r.Data) != "null" {
				t.Fatalf("a refused query returned data: %s", r.Data)
			}
		})
	}

	// What the pages ask for still runs: a full page of cards, and one
	// coffee with its comments, its shop's other coffees and similar ones.
	card := `id slug name roastLevel flavorNotes producer region imageUrls commentCount
		shop { slug name city } originCountry { nameEn nameZh } processingMethod { nameEn nameZh }
		variety { name } variants { priceTwd isAvailable }`
	var list struct {
		Coffees struct {
			Nodes []struct{ ID string }
		}
	}
	anon.mustDo(`{ coffees(limit: 100) { total nodes { `+card+` } } }`, nil, &list)
	if len(list.Coffees.Nodes) == 0 {
		t.Fatal("the seed has no published coffees")
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { `+card+`
		comments(limit: 20) { id body user { id displayName } }
		more: shop { coffees(limit: 5) { total nodes { `+card+` } } }
		similar(limit: 4) { `+card+` } } }`, map[string]any{"id": list.Coffees.Nodes[0].ID}, nil)

	// A document with more tokens than the limit is refused, not cut short and run.
	big := "{" + strings.Repeat(" shopsForMap { id }", graph.ParserTokenLimit/4+1) + " }"
	anon.expectCode(graph.CodeQueryTooComplex, big, nil)
	anon.mustDo("{ shopsForMap {"+strings.Repeat(" id", graph.ParserTokenLimit-10)+" } }", nil, nil)

	// Aliases can't multiply root fields (#283): 200 catalogue searches in one
	// request are refused, the site's widest operation (5) isn't.
	var many strings.Builder
	many.WriteString("{")
	for i := range 200 {
		fmt.Fprintf(&many, ` a%d: coffees(filter: {search: "aa bb cc dd ee ff gg hh"}, limit: 1) { total }`, i)
	}
	many.WriteString(" }")
	anon.expectCode(graph.CodeQueryTooComplex, many.String(), nil)

	// One comment list asking every author's shop 37 times over runs as one
	// batched query per level, so it is allowed and cheap (#283).
	var aliases strings.Builder
	for i := range 37 {
		fmt.Fprintf(&aliases, " s%d: shop { id }", i)
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { comments(limit: 100) { user {`+aliases.String()+` } } } }`,
		map[string]any{"id": list.Coffees.Nodes[0].ID}, nil)

	// A NUL (or another control character) in any string argument is
	// BAD_USER_INPUT before SQL, not a 500 (#283).
	for _, q := range []string{
		`{ coffees(filter: {search: "a\u0000b"}) { total } }`,
		`{ shop(slug: "a\u0000b") { id } }`,
		`query($s: String!) { shops(search: $s) { total } }`,
	} {
		r := anon.do(q, map[string]any{"s": "x\x01y"}, nil)
		if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeBadInput {
			t.Fatalf("%s: %+v", q, r.Errors)
		}
	}
	anon.expectCode(graph.CodeBadInput, `{ shops(city: "`+strings.Repeat("台", 41)+`") { total } }`, nil)
	anon.expectCode(graph.CodeBadInput, `{ coffees(filter: {flavorNote: "`+strings.Repeat("x", 31)+`"}) { total } }`, nil)
}

func TestIPRateLimit(t *testing.T) {
	calls := 0
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ })
	trusted, err := middleware.ParsePrefixes("192.0.2.0/24")
	if err != nil {
		t.Fatal(err)
	}
	h := middleware.ClientIPMiddleware(trusted)(graph.IPRateLimit(ratelimit.New(ratelimit.Rule{Burst: 2, Per: time.Hour}))(next))
	do := func(remote, xff string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(`{"query":"{__typename}"}`))
		req.RemoteAddr = remote
		if xff != "" {
			req.Header.Set("X-Forwarded-For", xff)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	steps := []struct {
		name, remote, xff string
		want              int
	}{
		{"first", "198.51.100.7:1000", "", 200},
		{"second", "198.51.100.7:1001", "", 200},
		{"third from the same address", "198.51.100.7:1002", "", 429},
		{"a made-up X-Forwarded-For from an untrusted address doesn't help", "198.51.100.7:1003", "203.0.113.99", 429},
		{"another address has its own budget", "198.51.100.8:1000", "", 200},
		{"behind our proxy the browser's address is the key", "192.0.2.10:1000", "203.0.113.5", 200},
		{"…second", "192.0.2.10:1000", "203.0.113.5", 200},
		{"…third", "192.0.2.10:1000", "203.0.113.5", 429},
		{"another browser behind the same proxy is unaffected", "192.0.2.10:1000", "203.0.113.6", 200},
	}
	for _, s := range steps {
		rec := do(s.remote, s.xff)
		if rec.Code != s.want {
			t.Fatalf("%s: status %d, want %d", s.name, rec.Code, s.want)
		}
		if s.want == 429 {
			body := rec.Body.String()
			if rec.Header().Get("Retry-After") == "" || !strings.Contains(body, `"code":"RATE_LIMITED"`) || !strings.Contains(body, `"retryAfter":`) {
				t.Fatalf("%s: a 429 must carry Retry-After and the RATE_LIMITED error shape, got %q %s", s.name, rec.Header().Get("Retry-After"), body)
			}
		}
	}
	if calls != 6 {
		t.Fatalf("the handler ran %d times, want 6", calls)
	}
	// No limiter configured (RATE_LIMIT_GRAPHQL_IP=0): everything passes.
	open := graph.IPRateLimit(nil)(next)
	for i := 0; i < 5; i++ {
		rec := httptest.NewRecorder()
		open.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/graphql", nil))
		if rec.Code != 200 {
			t.Fatalf("disabled limiter returned %d", rec.Code)
		}
	}
}
