package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestDuplicateCoffee: the owner copies a published coffee into a draft with
// the same details and options but no photos or comments; nobody else can.
// Requires TEST_DATABASE_URL.
func TestDuplicateCoffee(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())

	seller, _ := register(t, url, "dupseller+"+run+"@example.com")
	other, _ := register(t, url, "dupother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}
	for i, c := range []*gqlClient{seller, other} {
		c.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": fmt.Sprintf("dup-%d-%s", i, run), "name": "複製測試", "description": "", "city": "台南市"}}, nil)
	}
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)

	var created struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": withEssentials(t, map[string]any{
			"name": "Kenya Nyeri AA", "description": "Blackcurrant.", "roastLevel": "LIGHT",
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"flavorNotes": []string{"黑醋栗", "番茄"},
			"variants": []map[string]any{
				{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 480, "stock": 4},
				{"grind": "ESPRESSO", "weightG": 500, "priceTwd": 1100, "stock": 0},
			},
		})}, &created)
	src := created.CreateCoffee.ID
	var vs struct {
		Coffee struct{ Variants []struct{ ID string } }
	}
	seller.mustDo(`query($id: ID!) { coffee(id: $id) { variants { id } } }`, map[string]any{"id": src}, &vs)
	seller.mustDo(`mutation($id: ID!) { updateVariant(id: $id, input: { isAvailable: false }) { id } }`,
		map[string]any{"id": vs.Coffee.Variants[1].ID}, nil)
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": src}, nil)
	other.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": src, "body": "好喝"}}, nil)

	const dup = `mutation($id: ID!, $name: String) { duplicateCoffee(id: $id, name: $name) {
		id name slug description roastLevel flavorNotes imageUrls isPublished commentCount
		shop { id } originCountry { id } processingMethod { id }
		variants { grind weightG priceTwd stock isAvailable } } }`
	type copyT struct {
		ID, Name, Slug, Description, RoastLevel string
		FlavorNotes, ImageUrls                  []string
		IsPublished                             bool
		CommentCount                            int
		Shop, OriginCountry, ProcessingMethod   struct{ ID string }
		Variants                                []struct {
			Grind       string
			WeightG     int
			PriceTwd    int
			Stock       int
			IsAvailable bool
		}
	}

	for _, tt := range []struct {
		name   string
		client *gqlClient
		id     string
		vars   map[string]any
		code   string
	}{
		{"anonymous", anon, src, nil, graph.CodeUnauthenticated},
		{"another seller", other, src, nil, graph.CodeForbidden},
		{"malformed id", seller, "nope", nil, graph.CodeNotFound},
		{"unknown id", seller, "00000000-0000-0000-0000-000000000000", nil, graph.CodeNotFound},
		{"blank name", seller, src, map[string]any{"name": "  "}, graph.CodeBadInput},
		{"name too long", seller, src, map[string]any{"name": strings.Repeat("x", 121)}, graph.CodeBadInput},
	} {
		t.Run(tt.name, func(t *testing.T) {
			tt.client.t = t
			vars := map[string]any{"id": tt.id}
			for k, v := range tt.vars {
				vars[k] = v
			}
			tt.client.expectCode(tt.code, dup, vars)
		})
	}
	seller.t, other.t, anon.t = t, t, t

	var out struct{ DuplicateCoffee copyT }
	seller.mustDo(dup, map[string]any{"id": src}, &out)
	c := out.DuplicateCoffee
	switch {
	case c.ID == src || c.Name != "Kenya Nyeri AA (copy)" || !strings.HasPrefix(c.Slug, "kenya-nyeri-aa-copy-"):
		t.Fatalf("bad identity: %+v", c)
	case c.IsPublished || c.CommentCount != 0 || len(c.ImageUrls) != 0:
		t.Fatalf("copy should be a bare draft: %+v", c)
	case c.Description != "Blackcurrant." || c.RoastLevel != "LIGHT" || strings.Join(c.FlavorNotes, ",") != "黑醋栗,番茄":
		t.Fatalf("details not copied: %+v", c)
	case c.OriginCountry.ID != refs.OriginCountries[0].ID || c.ProcessingMethod.ID != refs.ProcessingMethods[0].ID:
		t.Fatalf("refs not copied: %+v", c)
	case len(c.Variants) != 2:
		t.Fatalf("variants = %+v", c.Variants)
	}
	if v := c.Variants[0]; v.Grind != "WHOLE_BEAN" || v.WeightG != 200 || v.PriceTwd != 480 || v.Stock != 4 || !v.IsAvailable {
		t.Errorf("variant 0 = %+v", v)
	}
	if v := c.Variants[1]; v.Grind != "ESPRESSO" || v.WeightG != 500 || v.PriceTwd != 1100 || v.IsAvailable {
		t.Errorf("variant 1 = %+v", v)
	}

	var named struct{ DuplicateCoffee copyT }
	seller.mustDo(dup, map[string]any{"id": src, "name": " 肯亞 2027 "}, &named)
	if named.DuplicateCoffee.Name != "肯亞 2027" || named.DuplicateCoffee.Shop.ID != c.Shop.ID {
		t.Fatalf("named copy = %+v", named.DuplicateCoffee)
	}
}
