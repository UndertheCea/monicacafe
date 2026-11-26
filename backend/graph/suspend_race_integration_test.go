package graph_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/underthecea/monicacafe/backend/graph"
)

// TestOwnerWriteRacingSuspension: an owner write whose ownership check ran
// before an admin's suspension committed must not land (#487). Each
// write runs while a suspension is held open in a transaction, so it passes
// ownedShop and then waits on the shop's row lock; once that commits, it is
// refused.
func TestOwnerWriteRacingSuspension(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "race+"+run+"@example.com")

	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "race-" + run, "name": "競態 " + run, "description": "", "city": "台中市"}}, &shop)
	shopID := shop.CreateShop.ID
	publishTestCoffee(t, pool, shopID)
	var coffeeID, variantID string
	if err := pool.QueryRow(ctx, `
		INSERT INTO variants (coffee_id, grind, weight_g, price_twd, stock)
		SELECT id, 'WHOLE_BEAN', 200, 450, 5 FROM coffees WHERE shop_id = $1
		RETURNING coffee_id, id`, shopID).Scan(&coffeeID, &variantID); err != nil {
		t.Fatal(err)
	}

	writes := []struct {
		name, query string
		vars        map[string]any
	}{
		{"updateShop", `mutation($id: ID!) { updateShop(id: $id, input: {description: "改了"}) { id } }`, map[string]any{"id": shopID}},
		{"reorderShopCoffees", `mutation($id: ID!, $c: [ID!]!) { reorderShopCoffees(shopId: $id, coffeeIds: $c) { id } }`,
			map[string]any{"id": shopID, "c": []string{coffeeID}}},
		{"updateCoffee", `mutation($id: ID!) { updateCoffee(id: $id, input: {description: "改了"}) { id } }`, map[string]any{"id": coffeeID}},
		{"unpublishCoffee", `mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}},
		{"updateVariant", `mutation($id: ID!) { updateVariant(id: $id, input: {stock: 3}) { id } }`, map[string]any{"id": variantID}},
		{"addVariant", `mutation($id: ID!) { addVariant(coffeeId: $id, input: {grind: WHOLE_BEAN, weightG: 500, priceTwd: 900, stock: 1}) { id } }`,
			map[string]any{"id": coffeeID}},
	}

	// The suspension runs on a connection of its own: the server's pool is
	// small, and one write at a time keeps it free for the request.
	conn, err := pgx.Connect(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)

	for _, w := range writes {
		t.Run(w.name, func(t *testing.T) {
			tx, err := conn.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback(ctx) }()
			if _, err := tx.Exec(ctx, `UPDATE shops SET suspended_at = now() WHERE id = $1`, shopID); err != nil {
				t.Fatal(err)
			}
			done := make(chan any, 1)
			go func() {
				r := (&gqlClient{t: t, url: url, token: seller.token}).do(w.query, w.vars, nil)
				var code any
				if len(r.Errors) > 0 {
					code = r.Errors[0].Extensions["code"]
				}
				done <- code
			}()
			// Wait until the write is queued behind the suspension's row
			// lock, so it has already passed its ownership check.
			deadline := time.Now().Add(10 * time.Second)
			for {
				var waiting int
				if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity
					WHERE datname = current_database() AND wait_event_type = 'Lock'`).Scan(&waiting); err != nil {
					t.Fatal(err)
				}
				if waiting > 0 {
					break
				}
				if time.Now().After(deadline) {
					t.Fatal("the write never waited on the shop lock")
				}
				time.Sleep(20 * time.Millisecond)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			if code := <-done; code != graph.CodeShopSuspended {
				t.Errorf("code = %v, want %s", code, graph.CodeShopSuspended)
			}
			if _, err := pool.Exec(ctx, `UPDATE shops SET suspended_at = NULL WHERE id = $1`, shopID); err != nil {
				t.Fatal(err)
			}
		})
	}
	var desc string
	if err := pool.QueryRow(ctx, `SELECT description FROM shops WHERE id = $1`, shopID).Scan(&desc); err != nil {
		t.Fatal(err)
	}
	if desc == "改了" {
		t.Error("updateShop landed on a suspended shop")
	}
}

// TestCreateShopRacingSuspension: a createShop that passed tokenGate before an
// admin's suspension committed must not leave a live shop for the suspended
// owner (#534). The suspension is held open in a transaction (the user row
// update and version bump SetUserSuspended makes); createShop must wait for it
// and then be refused, with no shop created.
func TestCreateShopRacingSuspension(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, auth := register(t, url, "shoprace+"+run+"@example.com")

	conn, err := pgx.Connect(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `UPDATE users SET suspended_at = now(), token_version = token_version + 1 WHERE id = $1`,
		auth.User.ID); err != nil {
		t.Fatal(err)
	}

	done := make(chan any, 1)
	go func() {
		r := seller.do(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
			map[string]any{"in": map[string]any{"slug": "shoprace-" + run, "name": "競態店 " + run, "description": "", "city": "台南市"}}, nil)
		var code any
		if len(r.Errors) > 0 {
			code = r.Errors[0].Extensions["code"]
		}
		done <- code
	}()
	deadline := time.Now().Add(10 * time.Second)
	for {
		var waiting int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity
			WHERE datname = current_database() AND wait_event_type = 'Lock'`).Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if waiting > 0 {
			break
		}
		select {
		case code := <-done:
			t.Fatalf("createShop finished (code %v) without waiting for the suspension", code)
		default:
		}
		if time.Now().After(deadline) {
			t.Fatal("createShop never waited on the user row")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if code := <-done; code != graph.CodeUnauthenticated {
		t.Errorf("code = %v, want %s", code, graph.CodeUnauthenticated)
	}
	var shops int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM shops WHERE owner_id = $1`, auth.User.ID).Scan(&shops); err != nil {
		t.Fatal(err)
	}
	if shops != 0 {
		t.Errorf("a suspended user got %d shop(s)", shops)
	}
}
