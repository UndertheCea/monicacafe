package graph_test

import (
	"fmt"
	"testing"
	"time"
)

// TestContactFilterAndReservedNames (#286): a shop name carrying a LINE ID is
// refused, and so is a reserved shop name (#444); the reserved display name "Admin" is refused on register and
// updateProfile; a user's role is visible to the user (and admins) only.
// Requires TEST_DATABASE_URL.
func TestContactFilterAndReservedNames(t *testing.T) {
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}

	// Reserved display name on register.
	anon.expectCode("BAD_USER_INPUT", `mutation($in: RegisterInput!) { register(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "resv+" + run + "@example.com", "password": "correct-horse-battery", "displayName": "Moni Cafe 客服"}})

	seller, sellerAuth := register(t, url, "cfseller+"+run+"@example.com")

	// Reserved display name on updateProfile, field displayName.
	r := seller.do(`mutation($in: UpdateProfileInput!) { updateProfile(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"displayName": "Admin"}}, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != "BAD_USER_INPUT" || r.Errors[0].Extensions["field"] != "displayName" {
		t.Fatalf("Admin display name: %+v", r.Errors)
	}
	// A blank-looking name is refused too; an ordinary change works.
	seller.expectCode("BAD_USER_INPUT", `mutation($in: UpdateProfileInput!) { updateProfile(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"displayName": "ㅤ"}})
	seller.mustDo(`mutation($in: UpdateProfileInput!) { updateProfile(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"displayName": "烘豆小王"}}, nil)

	// A shop name with a LINE ID is refused.
	seller.expectCode("CONTACT_INFO_NOT_ALLOWED", `mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "cf-" + run, "name": "好咖啡 LINE ID: goodcoffee88", "description": "", "city": "台北市"}})
	// A reserved shop name is refused on create (#444), field name.
	r = seller.do(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "cf-" + run, "name": "Moni Cafe 官方客服", "description": "", "city": "台北市"}}, nil)
	if len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != "BAD_USER_INPUT" || r.Errors[0].Extensions["field"] != "name" {
		t.Fatalf("reserved shop name on create: %+v", r.Errors)
	}
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "cf-" + run, "name": "好咖啡烘焙", "description": "", "city": "台北市"}}, &shop)
	// ... and on rename; renaming to something ordinary, or resending the stored name, works.
	const updShop = `mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { id } }`
	seller.expectCode("BAD_USER_INPUT", updShop, map[string]any{"id": shop.CreateShop.ID, "in": map[string]any{"name": "Support Team"}})
	seller.mustDo(updShop, map[string]any{"id": shop.CreateShop.ID, "in": map[string]any{"name": "好咖啡烘焙 Roastery"}}, nil)
	seller.mustDo(updShop, map[string]any{"id": shop.CreateShop.ID, "in": map[string]any{"name": "好咖啡烘焙 Roastery", "city": "新北市"}}, nil)
	// Nothing to change is refused, not a silent "edit" (#445).
	seller.expectCode("BAD_USER_INPUT", updShop, map[string]any{"id": shop.CreateShop.ID, "in": map[string]any{}})

	// Role: visible to its owner, hidden from other viewers.
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var out struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": withEssentials(t, map[string]any{
			"name": "Role", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		})}, &out)
	// A coffee name may use a staff word, on create and on rename (#466); contact
	// details in it are still refused.
	const updCoffee = `mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`
	seller.mustDo(updCoffee, map[string]any{"id": out.CreateCoffee.ID, "in": map[string]any{"name": "Official House Blend"}}, nil)
	seller.mustDo(updCoffee, map[string]any{"id": out.CreateCoffee.ID, "in": map[string]any{"name": "Staff Pick 官方 Blend 2026"}}, nil)
	seller.expectCode("CONTACT_INFO_NOT_ALLOWED", updCoffee,
		map[string]any{"id": out.CreateCoffee.ID, "in": map[string]any{"name": "Blend 0912-345-678"}})
	// Flavour notes are checked like descriptions.
	seller.expectCode("CONTACT_INFO_NOT_ALLOWED", `mutation($id: ID!, $in: UpdateCoffeeInput!) { updateCoffee(id: $id, input: $in) { id } }`,
		map[string]any{"id": out.CreateCoffee.ID, "in": map[string]any{"flavorNotes": []string{"Citrus", "ig 搜尋 coffee.lab"}}})
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": out.CreateCoffee.ID}, nil)
	buyer, _ := register(t, url, "cfbuyer+"+run+"@example.com")
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": out.CreateCoffee.ID, "body": "好喝"}}, nil)

	const q = `query($id: ID!) { coffee(id: $id) { comments { user { id role } } } }`
	type roles struct {
		Coffee struct {
			Comments []struct {
				User struct {
					ID   string
					Role *string
				}
			}
		}
	}
	var seen roles
	seller.mustDo(q, map[string]any{"id": out.CreateCoffee.ID}, &seen)
	if len(seen.Coffee.Comments) != 1 || seen.Coffee.Comments[0].User.Role != nil {
		t.Fatalf("role leaked to another viewer: %+v", seen)
	}
	var me struct{ Me struct{ Role *string } }
	seller.mustDo(`{ me { role } }`, nil, &me)
	if me.Me.Role == nil || *me.Me.Role != "SELLER" {
		t.Fatalf("own role: %+v", me)
	}

	// An admin sees every role.
	if _, err := pool.Exec(t.Context(), `UPDATE users SET role = 'ADMIN' WHERE id = $1`, sellerAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	admin := &gqlClient{t: t, url: url}
	var lg struct{ Login struct{ AccessToken string } }
	admin.mustDo(`mutation($in: LoginInput!) { login(input: $in) { accessToken } }`,
		map[string]any{"in": map[string]any{"email": "cfseller+" + run + "@example.com", "password": "correct-horse-battery"}}, &lg)
	admin.token = lg.Login.AccessToken
	buyerID := ""
	var ids roles
	admin.mustDo(q, map[string]any{"id": out.CreateCoffee.ID}, &ids)
	if len(ids.Coffee.Comments) == 1 {
		buyerID = ids.Coffee.Comments[0].User.ID
	}
	if buyerID == "" || ids.Coffee.Comments[0].User.Role == nil || *ids.Coffee.Comments[0].User.Role != "BUYER" {
		t.Fatalf("admin should see roles: %+v", ids)
	}
}
