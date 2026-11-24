package graph_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestTakedownsStick (#282): a coffee an admin took down can't be republished,
// duplicated or deleted by its seller until an admin restores it; a coffee
// with an open report can't be deleted; a suspended shop is read-only for its
// owner and unreachable through follow / unfollow; suspending a user suspends
// their shop. Requires TEST_DATABASE_URL.
func TestTakedownsStick(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	admin, adminAuth := register(t, url, "tdadmin+"+run+"@example.com")
	seller, sellerAuth := register(t, url, "tdseller+"+run+"@example.com")
	buyer, _ := register(t, url, "tdbuyer+"+run+"@example.com")
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'ADMIN', token_version = token_version + 1 WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}
	var lg struct{ Login authPayload }
	(&gqlClient{t: t, url: url}).mustDo(`mutation($in: LoginInput!) { login(input: $in) { `+authFields+` } }`,
		map[string]any{"in": map[string]any{"email": "tdadmin+" + run + "@example.com", "password": "correct-horse-battery"}}, &lg)
	admin.token = lg.Login.AccessToken

	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "td-" + run, "name": "下架測試 " + run, "description": "", "city": "台中市"}}, &shop)
	shopID := shop.CreateShop.ID
	publishTestCoffee(t, pool, shopID)
	var coffeeID string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1`, shopID).Scan(&coffeeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock, is_available)
		VALUES ($1, 'WHOLE_BEAN', 200, 450, 5, true)`, coffeeID); err != nil {
		t.Fatal(err)
	}
	id := map[string]any{"id": coffeeID}
	const (
		publish   = `mutation($id: ID!) { publishCoffee(id: $id) { id isPublished } }`
		unpublish = `mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`
		duplicate = `mutation($id: ID!) { duplicateCoffee(id: $id) { id } }`
		del       = `mutation($id: ID!) { deleteCoffee(id: $id) }`
	)

	// ── Takedown ──────────────────────────────────────────────────────────────
	var down struct {
		AdminUnpublishCoffee struct {
			IsPublished, TakenDown bool
		}
	}
	admin.mustDo(`mutation($id: ID!) { adminUnpublishCoffee(id: $id, reason: "fake origin") { isPublished takenDown } }`, id, &down)
	if down.AdminUnpublishCoffee.IsPublished || !down.AdminUnpublishCoffee.TakenDown {
		t.Fatalf("after takedown: %+v", down)
	}
	seller.expectCode(graph.CodeTakenDown, publish, id)
	seller.expectCode(graph.CodeTakenDown, duplicate, id)
	seller.expectCode(graph.CodeTakenDown, del, id)
	var mine struct {
		Me struct {
			Shop struct {
				Coffees struct {
					Nodes []struct {
						ID        string
						TakenDown bool
					}
				}
			}
		}
	}
	seller.mustDo(`{ me { shop { coffees { nodes { id takenDown } } } } }`, nil, &mine)
	if n := mine.Me.Shop.Coffees.Nodes; len(n) != 1 || !n[0].TakenDown {
		t.Fatalf("seller should see the takedown: %+v", mine)
	}
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { adminUnpublishCoffee(id: $id, reason: "again") { id } }`, id)

	// /admin lists it (#497) with when it was taken down, until it is restored.
	listed := func() *struct {
		ID          string
		TakenDownAt *string
		Shop        struct{ ID string }
	} {
		var all struct {
			AdminTakenDownCoffees struct {
				Total int
				Nodes []struct {
					ID          string
					TakenDownAt *string
					Shop        struct{ ID string }
				}
			}
		}
		admin.mustDo(`{ adminTakenDownCoffees(limit: 100) { total nodes { id takenDownAt shop { id } } } }`, nil, &all)
		if all.AdminTakenDownCoffees.Total < len(all.AdminTakenDownCoffees.Nodes) {
			t.Fatalf("total below the page: %+v", all)
		}
		for i := range all.AdminTakenDownCoffees.Nodes {
			if n := &all.AdminTakenDownCoffees.Nodes[i]; n.ID == coffeeID {
				return n
			}
		}
		return nil
	}
	if n := listed(); n == nil || n.TakenDownAt == nil || n.Shop.ID == "" {
		t.Fatalf("taken-down coffee missing from adminTakenDownCoffees: %+v", n)
	}
	seller.expectCode(graph.CodeForbidden, `{ adminTakenDownCoffees { total } }`, nil)

	// Restoring is admin-only, needs a reason, and lets the seller publish again.
	seller.expectCode(graph.CodeForbidden, `mutation($id: ID!) { adminRestoreCoffee(id: $id, reason: "x") { id } }`, id)
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { adminRestoreCoffee(id: $id, reason: " ") { id } }`, id)
	var restored struct {
		AdminRestoreCoffee struct {
			TakenDown   bool
			TakenDownAt *string
		}
	}
	admin.mustDo(`mutation($id: ID!) { adminRestoreCoffee(id: $id, reason: "origin fixed") { takenDown takenDownAt } }`, id, &restored)
	if restored.AdminRestoreCoffee.TakenDown || restored.AdminRestoreCoffee.TakenDownAt != nil {
		t.Fatalf("after restore: %+v", restored)
	}
	if n := listed(); n != nil {
		t.Fatalf("restored coffee still listed: %+v", n)
	}
	admin.expectCode(graph.CodeBadInput, `mutation($id: ID!) { adminRestoreCoffee(id: $id, reason: "again") { id } }`, id)
	var pub struct{ PublishCoffee struct{ IsPublished bool } }
	seller.mustDo(publish, id, &pub)
	if !pub.PublishCoffee.IsPublished {
		t.Fatal("restored coffee should publish")
	}
	var actions []string
	rows, err := pool.Query(ctx, `SELECT action FROM audit_log WHERE target_id = $1 ORDER BY created_at`, coffeeID)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var a string
		if err := rows.Scan(&a); err != nil {
			t.Fatal(err)
		}
		actions = append(actions, a)
	}
	rows.Close()
	if fmt.Sprint(actions) != "[UNPUBLISH_COFFEE RESTORE_COFFEE]" {
		t.Fatalf("audit = %v", actions)
	}

	// ── An open report blocks deletion ────────────────────────────────────────
	buyer.mustDo(`mutation($id: ID!) { report(targetType: COFFEE, targetId: $id, reason: MISLEADING) }`, id, nil)
	seller.mustDo(unpublish, id, nil)
	if r := seller.do(del, id, nil); len(r.Errors) == 0 || r.Errors[0].Extensions["code"] != graph.CodeConflict ||
		r.Errors[0].Extensions["field"] != "reports" {
		t.Fatalf("delete with an open report: %+v", r.Errors)
	}

	// ── Suspended shop: read-only for its owner, unreachable for followers ───
	admin.mustDo(`mutation($id: ID!) { suspendShop(id: $id, reason: "counterfeit") { id } }`, map[string]any{"id": shopID}, nil)
	seller.expectCode(graph.CodeShopSuspended, publish, id)
	seller.expectCode(graph.CodeShopSuspended, `mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { id } }`,
		map[string]any{"id": shopID, "in": map[string]any{"name": "新名字"}})
	buyer.expectCode(graph.CodeNotFound, `mutation($id: ID!) { followShop(id: $id) { id } }`, map[string]any{"id": shopID})
	buyer.expectCode(graph.CodeNotFound, `mutation($id: ID!) { unfollowShop(id: $id) { id } }`, map[string]any{"id": shopID})
	// Nor may it add coffees (#431).
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	buyer.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	const create = `mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`
	newCoffee := map[string]any{"in": withEssentials(t, map[string]any{
		"name": "Suspended draft", "description": "", "flavorNotes": []string{"Citrus"},
		"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
		"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 480, "stock": 3}},
	})}
	seller.expectCode(graph.CodeShopSuspended, create, newCoffee)
	admin.mustDo(`mutation($id: ID!) { unsuspendShop(id: $id, reason: "resolved") { id } }`, map[string]any{"id": shopID}, nil)
	seller.mustDo(publish, id, nil)
	seller.mustDo(create, newCoffee, nil)

	// ── Suspending the owner suspends the shop; reinstating leaves it ────────
	admin.mustDo(`mutation($id: ID!) { suspendUser(id: $id, reason: "fraud") { id } }`, map[string]any{"id": sellerAuth.User.ID}, nil)
	var suspended bool
	if err := pool.QueryRow(ctx, `SELECT suspended_at IS NOT NULL FROM shops WHERE id = $1`, shopID).Scan(&suspended); err != nil {
		t.Fatal(err)
	}
	if !suspended {
		t.Fatal("suspending the owner should suspend the shop")
	}
	var reason string
	if err := pool.QueryRow(ctx, `SELECT reason FROM audit_log WHERE target_id = $1 AND action = 'SUSPEND_SHOP' ORDER BY created_at DESC LIMIT 1`, shopID).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if reason != "owner suspended: fraud" {
		t.Fatalf("shop audit reason = %q", reason)
	}
	admin.mustDo(`mutation($id: ID!) { unsuspendUser(id: $id, reason: "appeal") { id } }`, map[string]any{"id": sellerAuth.User.ID}, nil)
	if err := pool.QueryRow(ctx, `SELECT suspended_at IS NOT NULL FROM shops WHERE id = $1`, shopID).Scan(&suspended); err != nil {
		t.Fatal(err)
	}
	if !suspended {
		t.Fatal("reinstating the owner shouldn't reinstate the shop")
	}
}
