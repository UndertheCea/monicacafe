package graph_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// These tests exercise the full GraphQL stack against a migrated PostgreSQL
// database. Set TEST_DATABASE_URL to run them, e.g.
//
//	TEST_DATABASE_URL=postgres://monica:monica_secret@localhost:5432/monicacafe go test ./graph/
//
// Each run creates uniquely named users/shops, so a shared dev database is fine.

type gqlClient struct {
	t     *testing.T
	url   string
	token string
	// ip, when set, is sent as X-Forwarded-For; the test server trusts
	// loopback, so the API sees the request as coming from ip.
	ip string
}

type gqlResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message    string         `json:"message"`
		Extensions map[string]any `json:"extensions"`
	} `json:"errors"`
}

func (c *gqlClient) do(query string, vars map[string]any, out any) *gqlResponse {
	c.t.Helper()
	body, _ := json.Marshal(map[string]any{"query": query, "variables": vars})
	req, _ := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	if c.ip != "" {
		req.Header.Set("X-Forwarded-For", c.ip)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var r gqlResponse
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		c.t.Fatal(err)
	}
	if out != nil && len(r.Errors) == 0 {
		if err := json.Unmarshal(r.Data, out); err != nil {
			c.t.Fatal(err)
		}
	}
	return &r
}

func (c *gqlClient) mustDo(query string, vars map[string]any, out any) {
	c.t.Helper()
	if r := c.do(query, vars, out); len(r.Errors) > 0 {
		c.t.Fatalf("unexpected errors: %+v", r.Errors)
	}
}

func (c *gqlClient) expectCode(code, query string, vars map[string]any) {
	c.t.Helper()
	r := c.do(query, vars, nil)
	if len(r.Errors) == 0 {
		c.t.Fatalf("expected %s error, got none", code)
	}
	if got := r.Errors[0].Extensions["code"]; got != code {
		c.t.Fatalf("expected code %s, got %v (%s)", code, got, r.Errors[0].Message)
	}
}

func newTestServer(t *testing.T) (string, *pgxpool.Pool) {
	t.Helper()
	return newTestServerWith(t, nil)
}

// newTestServerWith lets a test adjust the resolver (e.g. set rate limits)
// before the server starts.
func newTestServerWith(t *testing.T, configure func(*graph.Resolver)) (string, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	st := store.New(pool)
	authSvc := auth.NewService("test-access", "test-refresh")
	resolver := graph.NewResolver(st, authSvc, testMedia(t))
	if configure != nil {
		configure(resolver)
	}
	// The same handler as production, limits included (#207).
	srv := graph.NewServer(resolver, false)

	loopback := []netip.Prefix{netip.MustParsePrefix("127.0.0.0/8"), netip.MustParsePrefix("::1/128")}
	h := middleware.ClientIPMiddleware(loopback)(middleware.Auth(authSvc)(graph.LoaderMiddleware(st)(srv)))
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)
	return ts.URL, pool
}

const authFields = `accessToken refreshToken user { id email displayName role }`

type authPayload struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	User         struct {
		ID    string  `json:"id"`
		Email *string `json:"email"`
		Role  string  `json:"role"`
	} `json:"user"`
}

func register(t *testing.T, url, email string) (*gqlClient, authPayload) {
	t.Helper()
	c := &gqlClient{t: t, url: url}
	var out struct{ Register authPayload }
	c.mustDo(`mutation($in: RegisterInput!) { register(input: $in) { `+authFields+` } }`,
		map[string]any{"in": map[string]any{"email": email, "password": "correct-horse-battery", "displayName": "測試用戶"}}, &out)
	c.token = out.Register.AccessToken
	return c, out.Register
}

func TestMarketplaceFlow(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}

	// ── Auth ────────────────────────────────────────────────────────────────
	seller, sellerAuth := register(t, url, "Seller+"+run+"@Example.com")
	if sellerAuth.User.Role != "BUYER" || sellerAuth.User.Email == nil ||
		*sellerAuth.User.Email != "seller+"+run+"@example.com" {
		t.Fatalf("unexpected registered user: %+v", sellerAuth.User)
	}
	anon.expectCode(graph.CodeConflict, `mutation($in: RegisterInput!) { register(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "seller+" + run + "@example.com", "password": "another-password", "displayName": "dup"}})
	anon.expectCode(graph.CodeBadInput, `mutation($in: RegisterInput!) { register(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "weak" + run + "@example.com", "password": "short", "displayName": "weak"}})
	anon.expectCode(graph.CodeUnauthenticated, `mutation($in: LoginInput!) { login(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "seller+" + run + "@example.com", "password": "wrong-password"}})

	var login struct{ Login authPayload }
	anon.mustDo(`mutation($in: LoginInput!) { login(input: $in) { `+authFields+` } }`,
		map[string]any{"in": map[string]any{"email": "SELLER+" + run + "@example.com", "password": "correct-horse-battery"}}, &login)
	if login.Login.User.ID != sellerAuth.User.ID {
		t.Fatal("login returned a different user")
	}

	// Refresh rotates. Replaying the previous token within the grace window
	// (the browser aborted the refresh response) rotates again instead of
	// ending every session (#24).
	const refreshQ = `mutation($t: String!) { refreshToken(token: $t) { ` + authFields + ` } }`
	var refreshed, replayed, replayedAgain struct{ RefreshToken authPayload }
	anon.mustDo(refreshQ, map[string]any{"t": login.Login.RefreshToken}, &refreshed)
	anon.mustDo(refreshQ, map[string]any{"t": login.Login.RefreshToken}, &replayed)
	anon.mustDo(refreshQ, map[string]any{"t": login.Login.RefreshToken}, &replayedAgain)
	if replayedAgain.RefreshToken.User.ID != sellerAuth.User.ID || replayedAgain.RefreshToken.RefreshToken == refreshed.RefreshToken.RefreshToken {
		t.Fatal("grace replay should issue a new refresh token for the same user")
	}
	var activeChain int
	if err := pool.QueryRow(context.Background(), `
		SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
		sellerAuth.User.ID).Scan(&activeChain); err != nil {
		t.Fatal(err)
	}
	// The register token plus the newest token of the login chain: the
	// successors the browser never received were retired.
	if activeChain != 2 {
		t.Fatalf("want 2 active refresh tokens after grace replays, got %d", activeChain)
	}
	// Outside the window, replaying a rotated token is reuse: it is rejected
	// and every session for the user is revoked, including the newest token.
	if _, err := pool.Exec(context.Background(), `
		UPDATE refresh_tokens SET revoked_at = revoked_at - interval '1 minute'
		WHERE user_id = $1 AND revoked_at IS NOT NULL`, sellerAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	anon.expectCode(graph.CodeUnauthenticated, `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`,
		map[string]any{"t": login.Login.RefreshToken})
	anon.expectCode(graph.CodeUnauthenticated, `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`,
		map[string]any{"t": replayedAgain.RefreshToken.RefreshToken})

	var me struct {
		Me *struct {
			ID    string
			Email *string
		}
	}
	seller.mustDo(`{ me { id email } }`, nil, &me)
	if me.Me == nil || me.Me.ID != sellerAuth.User.ID {
		t.Fatalf("me returned %+v", me.Me)
	}
	anon.mustDo(`{ me { id } }`, nil, &me)
	if me.Me != nil {
		t.Fatal("anonymous me should be null")
	}

	// ── Shop ────────────────────────────────────────────────────────────────
	anon.expectCode(graph.CodeUnauthenticated, `mutation { createShop(input: {slug: "x-shop", name: "x", description: "", city: "台北"}) { id } }`, nil)
	slug := "roastery-" + run
	var shop struct{ CreateShop struct{ ID, Slug string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id slug } }`,
		map[string]any{"in": map[string]any{"slug": strings.ToUpper(slug), "name": "山嵐烘焙", "description": "Small-batch roaster", "city": "台北市"}}, &shop)
	if shop.CreateShop.Slug != slug {
		t.Fatalf("slug not normalised: %q", shop.CreateShop.Slug)
	}
	seller.expectCode(graph.CodeConflict, `mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug + "-two", "name": "Second", "description": "", "city": "台中市"}})

	buyer, buyerAuth := register(t, url, "buyer+"+run+"@example.com")
	buyer.expectCode(graph.CodeConflict, `mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": slug, "name": "Copycat", "description": "", "city": "台北市"}})
	buyer.expectCode(graph.CodeForbidden, `mutation($id: ID!) { updateShop(id: $id, input: {name: "hijack"}) { id } }`,
		map[string]any{"id": shop.CreateShop.ID})

	lat, lng := 25.033, 121.5654
	seller.mustDo(`mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { id } }`,
		map[string]any{"id": shop.CreateShop.ID, "in": map[string]any{"lat": lat, "lng": lng}}, nil)
	seller.expectCode(graph.CodeBadInput, `mutation($id: ID!) { updateShop(id: $id, input: {lat: 91}) { id } }`,
		map[string]any{"id": shop.CreateShop.ID})

	// The map query exposes the pin with both coordinates once the shop has a
	// published coffee; an empty shop isn't on the map (#213).
	mapPin := func() (found, exact bool) {
		var pins struct {
			ShopsForMap []struct {
				Slug     string
				Lat, Lng *float64
			}
		}
		anon.mustDo(`{ shopsForMap { slug lat lng } }`, nil, &pins)
		for _, p := range pins.ShopsForMap {
			if p.Slug == slug {
				return true, p.Lat != nil && p.Lng != nil && *p.Lat == lat && *p.Lng == lng
			}
		}
		return false, false
	}
	if found, _ := mapPin(); found {
		t.Fatalf("shopsForMap shows %s before it has a published coffee", slug)
	}

	// ── Coffee ──────────────────────────────────────────────────────────────
	var refs struct {
		OriginCountries   []struct{ ID, NameEn string }
		ProcessingMethods []struct{ ID, NameEn string }
		CoffeeVarieties   []struct{ ID, Name string }
	}
	anon.mustDo(`{ originCountries { id nameEn } processingMethods { id nameEn } coffeeVarieties { id name } }`, nil, &refs)
	if len(refs.OriginCountries) == 0 || len(refs.ProcessingMethods) == 0 || len(refs.CoffeeVarieties) == 0 {
		t.Fatal("reference data not seeded")
	}

	coffeeIn := withEssentials(t, map[string]any{
		"name": "衣索比亞 耶加雪菲 Kochere", "description": "Floral and bright.",
		"originCountryId": refs.OriginCountries[0].ID, "varietyId": refs.CoffeeVarieties[0].ID,
		"processingMethodId": refs.ProcessingMethods[0].ID, "roastLevel": "LIGHT",
		"flavorNotes": []string{"Jasmine", "jasmine", " Bergamot ", "Peach-" + run},
		"variants": []map[string]any{
			{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 520, "stock": 12},
			{"grind": "WHOLE_BEAN", "weightG": 500, "priceTwd": 1150, "stock": 0},
		},
	})
	buyer.expectCode(graph.CodeForbidden, `mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": coffeeIn})
	bad := map[string]any{}
	for k, v := range coffeeIn {
		bad[k] = v
	}
	bad["originCountryId"] = "00000000-0000-0000-0000-000000000000"
	seller.expectCode(graph.CodeBadInput, `mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": bad})

	var created struct {
		CreateCoffee struct {
			ID, Slug    string
			IsPublished bool
			FlavorNotes []string
			Variants    []struct {
				PriceTwd    int
				IsAvailable bool
			}
		}
	}
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) {
		id slug isPublished flavorNotes variants { priceTwd isAvailable } } }`, map[string]any{"in": coffeeIn}, &created)
	co := created.CreateCoffee
	if co.IsPublished || !strings.HasPrefix(co.Slug, "kochere-") || len(co.FlavorNotes) != 3 || len(co.Variants) != 2 {
		t.Fatalf("unexpected coffee: %+v", co)
	}
	if co.Variants[0].PriceTwd != 520 || !co.Variants[0].IsAvailable || co.Variants[1].IsAvailable {
		t.Fatalf("unexpected variants: %+v", co.Variants)
	}

	// Drafts are hidden from everyone but the owner.
	var got struct{ Coffee *struct{ ID string } }
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { id } }`, map[string]any{"id": co.ID}, &got)
	if got.Coffee != nil {
		t.Fatal("draft visible to anonymous user")
	}
	seller.mustDo(`query($id: ID!) { coffee(id: $id) { id } }`, map[string]any{"id": co.ID}, &got)
	if got.Coffee == nil {
		t.Fatal("draft hidden from its owner")
	}
	buyer.expectCode(graph.CodeForbidden, `mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": co.ID})
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { isPublished } }`, map[string]any{"id": co.ID}, nil)
	if found, exact := mapPin(); !found || !exact {
		t.Fatalf("shopsForMap: pin for %s found=%v exact=%v after publishing", slug, found, exact)
	}

	var upd struct {
		UpdateCoffee struct{ Name, RoastLevel string }
	}
	seller.mustDo(`mutation($id: ID!) { updateCoffee(id: $id, input: {name: "Kochere G1", roastLevel: MEDIUM}) { name roastLevel } }`,
		map[string]any{"id": co.ID}, &upd)
	if upd.UpdateCoffee.Name != "Kochere G1" || upd.UpdateCoffee.RoastLevel != "MEDIUM" {
		t.Fatalf("update not applied: %+v", upd)
	}

	// The variety is required since #176: it can be changed, and there is no
	// clearVariety any more.
	seller.expectCode("GRAPHQL_VALIDATION_FAILED", `mutation($id: ID!) { updateCoffee(id: $id, input: {clearVariety: true}) { id } }`,
		map[string]any{"id": co.ID})
	var changed struct {
		UpdateCoffee struct {
			Name    string
			Variety *struct{ ID string }
		}
	}
	other := refs.CoffeeVarieties[len(refs.CoffeeVarieties)-1].ID
	seller.mustDo(`mutation($id: ID!, $v: ID!) { updateCoffee(id: $id, input: {varietyId: $v}) { name variety { id } } }`,
		map[string]any{"id": co.ID, "v": other}, &changed)
	if changed.UpdateCoffee.Variety == nil || changed.UpdateCoffee.Variety.ID != other || changed.UpdateCoffee.Name != "Kochere G1" {
		t.Fatalf("variety change not applied (or clobbered other fields): %+v", changed)
	}

	// ── Browse & filter ─────────────────────────────────────────────────────
	type listing struct {
		Coffees struct {
			Total int
			Nodes []struct {
				ID   string
				Shop struct{ Slug string }
			}
		}
	}
	var l listing
	anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f) { total nodes { id shop { slug } } } }`,
		map[string]any{"f": map[string]any{"flavorNote": "PEACH-" + run, "roastLevel": "MEDIUM", "minPriceTwd": 500, "maxPriceTwd": 600}}, &l)
	if l.Coffees.Total != 1 || l.Coffees.Nodes[0].ID != co.ID || l.Coffees.Nodes[0].Shop.Slug != slug {
		t.Fatalf("filter did not find coffee: %+v", l)
	}
	anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f) { total nodes { id shop { slug } } } }`,
		map[string]any{"f": map[string]any{"flavorNote": "Peach-" + run, "minPriceTwd": 1000}}, &l)
	if l.Coffees.Total != 0 {
		t.Fatal("price filter should exclude coffees whose only matching variant is out of range or unavailable")
	}
	anon.expectCode(graph.CodeBadInput, `{ coffees(filter: {minPriceTwd: 10, maxPriceTwd: 5}) { total } }`, nil)
	// Sorting by price still finds it (store tests cover the order itself).
	anon.mustDo(`query($f: CoffeeFilter) { coffees(filter: $f, sort: PRICE_ASC) { total nodes { id shop { slug } } } }`,
		map[string]any{"f": map[string]any{"flavorNote": "PEACH-" + run}}, &l)
	if l.Coffees.Total != 1 || l.Coffees.Nodes[0].ID != co.ID {
		t.Fatalf("sorted listing did not find coffee: %+v", l)
	}

	var shopQ struct {
		Shop *struct {
			Name    string
			Lat     *float64
			Coffees struct{ Total int }
		}
	}
	anon.mustDo(`query($s: String!) { shop(slug: $s) { name lat coffees { total } } }`, map[string]any{"s": slug}, &shopQ)
	if shopQ.Shop == nil || shopQ.Shop.Coffees.Total != 1 || shopQ.Shop.Lat == nil || *shopQ.Shop.Lat != lat {
		t.Fatalf("unexpected shop: %+v", shopQ.Shop)
	}

	// ── Comments ────────────────────────────────────────────────────────────
	anon.expectCode(graph.CodeUnauthenticated, `mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": co.ID, "body": "hi"}})
	buyer.expectCode(graph.CodeBadInput, `mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": co.ID, "body": "   "}})
	var cm struct {
		AddComment struct {
			ID   string
			User struct {
				ID    string
				Email *string
			}
		}
	}
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id user { id email } } }`,
		map[string]any{"in": map[string]any{"coffeeId": co.ID, "body": "好喝！花香很明顯"}}, &cm)
	if cm.AddComment.User.ID != buyerAuth.User.ID {
		t.Fatal("comment attributed to wrong user")
	}

	var detail struct {
		Coffee struct {
			CommentCount int
			Comments     []struct {
				Body string
				User struct{ Email *string }
			}
		}
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { commentCount comments { body user { email } } } }`,
		map[string]any{"id": co.ID}, &detail)
	if detail.Coffee.CommentCount != 1 || detail.Coffee.Comments[0].User.Email != nil {
		t.Fatalf("comment detail wrong or email leaked: %+v", detail.Coffee)
	}

	// Comment pages (#38): newest first, limit + offset, no overlap.
	for _, body := range []string{"第二則", "third"} {
		buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"coffeeId": co.ID, "body": body}}, nil)
	}
	var pages [2]struct {
		Coffee struct {
			Comments []struct{ ID, Body string }
		}
	}
	const pageQ = `query($id: ID!, $o: Int) { coffee(id: $id) { comments(limit: 2, offset: $o) { id body } } }`
	anon.mustDo(pageQ, map[string]any{"id": co.ID, "o": 0}, &pages[0])
	anon.mustDo(pageQ, map[string]any{"id": co.ID, "o": 2}, &pages[1])
	var bodies []string
	for _, p := range pages {
		for _, c := range p.Coffee.Comments {
			bodies = append(bodies, c.Body)
		}
	}
	if want := []string{"third", "第二則", "好喝！花香很明顯"}; fmt.Sprint(bodies) != fmt.Sprint(want) {
		t.Fatalf("comment pages = %q, want %q", bodies, want)
	}
	for _, c := range pages[0].Coffee.Comments {
		buyer.mustDo(`mutation($id: ID!) { deleteComment(id: $id) }`, map[string]any{"id": c.ID}, nil)
	}

	seller.expectCode(graph.CodeForbidden, `mutation($id: ID!) { deleteComment(id: $id) }`, map[string]any{"id": cm.AddComment.ID})
	buyer.mustDo(`mutation($id: ID!) { deleteComment(id: $id) }`, map[string]any{"id": cm.AddComment.ID}, nil)
	buyer.expectCode(graph.CodeNotFound, `mutation($id: ID!) { deleteComment(id: $id) }`, map[string]any{"id": cm.AddComment.ID})

	// ── Unpublish & logout ──────────────────────────────────────────────────
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { isPublished } }`, map[string]any{"id": co.ID}, nil)
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { id } }`, map[string]any{"id": co.ID}, &got)
	if got.Coffee != nil {
		t.Fatal("unpublished coffee still visible")
	}

	var role string
	if err := pool.QueryRow(context.Background(), `SELECT role FROM users WHERE id = $1`, sellerAuth.User.ID).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != "SELLER" {
		t.Fatalf("shop owner should be promoted to SELLER, got %s", role)
	}

	seller.mustDo(`mutation { logout }`, nil, nil)
	anon.expectCode(graph.CodeUnauthenticated, `mutation($t: String!) { refreshToken(token: $t) { accessToken } }`,
		map[string]any{"t": sellerAuth.RefreshToken})
}

// testVarietyID is a variety id for test coffees: a variety is required on
// create since #176 (owner). Heirloom is in migration 001's reference data.
// publishTestCoffee gives a shop one published coffee straight in the
// database, so public shop listings (which hide empty shops, #213) show it.
func publishTestCoffee(t *testing.T, pool *pgxpool.Pool, shopID string) {
	t.Helper()
	_, err := pool.Exec(context.Background(), `
		INSERT INTO coffees (shop_id, name, slug, origin_country_id, processing_method_id, is_published)
		SELECT $1, 'listed', 'listed-' || gen_random_uuid(),
			(SELECT id FROM origin_countries ORDER BY id LIMIT 1),
			(SELECT id FROM processing_methods ORDER BY id LIMIT 1), true`, shopID)
	if err != nil {
		t.Fatal(err)
	}
}

func testVarietyID(t *testing.T) string {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	var id string
	if err := pool.QueryRow(context.Background(), `SELECT id FROM coffee_varieties WHERE name = 'Heirloom'`).Scan(&id); err != nil {
		t.Fatalf("heirloom variety: %v", err)
	}
	return id
}

// essentials are the details every new coffee needs since #176, for test
// inputs that don't test them: merge with withEssentials.
func withEssentials(t *testing.T, in map[string]any) map[string]any {
	t.Helper()
	for k, v := range map[string]any{
		"varietyId": testVarietyID(t), "producer": "Test Farm", "region": "Test Region", "altitudeMinM": 1500,
	} {
		if _, set := in[k]; !set {
			in[k] = v
		}
	}
	return in
}
