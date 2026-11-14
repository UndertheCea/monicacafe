package graph

import (
	"errors"
	"testing"

	"github.com/underthecea/monicacafe/backend/internal/store"
)

func codeOf(err error) string {
	var ae *apiError
	if errors.As(err, &ae) {
		return ae.code
	}
	if err != nil {
		return "other"
	}
	return ""
}

func TestCartAddProblem(t *testing.T) {
	cv := func(stock int, avail, live, public bool) *store.CartVariant {
		return &store.CartVariant{Variant: store.Variant{Stock: stock, IsAvailable: avail, PriceTWD: 450}, VariantLive: live, CoffeePublic: public}
	}
	ok := cv(10, true, true, true)
	cases := []struct {
		name             string
		cv               *store.CartVariant
		have, add, lines int
		want             string
	}{
		{"first bag", ok, 0, 1, 0, ""},
		{"up to the stock", ok, 4, 6, 3, ""},
		{"past the stock", ok, 4, 7, 3, CodeBadInput},
		{"past 20 with plenty of stock", cv(500, true, true, true), 15, 6, 1, CodeBadInput},
		{"exactly 20", cv(500, true, true, true), 15, 5, 1, ""},
		{"zero", ok, 0, 0, 0, CodeBadInput},
		{"negative", ok, 0, -1, 0, CodeBadInput},
		{"sold out", cv(0, true, true, true), 0, 1, 0, CodeBadInput},
		{"off sale", cv(10, false, true, true), 0, 1, 0, CodeBadInput},
		{"archived option", cv(10, false, false, true), 0, 1, 0, CodeNotFound},
		{"draft coffee", cv(10, true, true, false), 0, 1, 0, CodeNotFound},
		{"full cart, new line", ok, 0, 1, store.MaxCartLines, CodeLimitReached},
		{"full cart, existing line", ok, 1, 1, store.MaxCartLines, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := codeOf(cartAddProblem(tc.cv, tc.have, tc.add, tc.lines)); got != tc.want {
				t.Fatalf("code = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestCartUpdateProblem(t *testing.T) {
	line := func(qty, stock int, avail, live, public bool) *store.CartLine {
		return &store.CartLine{Quantity: qty, Variant: store.Variant{Stock: stock, IsAvailable: avail}, VariantLive: live, CoffeePublic: public}
	}
	cases := []struct {
		name string
		l    *store.CartLine
		qty  int
		want string
	}{
		{"raise within stock", line(2, 5, true, true, true), 5, ""},
		{"raise past stock", line(2, 5, true, true, true), 6, CodeBadInput},
		{"lower a sold-out line", line(3, 0, true, true, true), 1, ""},
		{"keep the same", line(3, 0, false, false, false), 3, ""},
		{"raise an archived line", line(1, 9, false, false, true), 2, CodeBadInput},
		{"raise a line whose coffee is gone", line(1, 9, true, true, false), 2, CodeBadInput},
		{"zero", line(1, 9, true, true, true), 0, CodeBadInput},
		{"21", line(1, 99, true, true, true), 21, CodeBadInput},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := codeOf(cartUpdateProblem(tc.l, tc.qty)); got != tc.want {
				t.Fatalf("code = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestBuildCart(t *testing.T) {
	line := func(id string, qty int, added, price int64, stock int, avail, live, public bool) *store.CartLine {
		return &store.CartLine{ID: id, Quantity: qty, AddedPriceTWD: added,
			Variant:     store.Variant{ID: "v" + id, CoffeeID: "c" + id, Grind: "WHOLE_BEAN", WeightG: 200, PriceTWD: price, Stock: stock, IsAvailable: avail},
			VariantLive: live, CoffeePublic: public}
	}
	cart := buildCart([]*store.CartLine{
		line("a", 2, 450, 450, 10, true, true, true), // 900
		line("b", 1, 500, 520, 3, true, true, true),  // 520, price changed
		line("c", 4, 300, 300, 2, true, true, true),  // short of stock
		line("d", 1, 300, 300, 9, true, false, true), // archived
		line("e", 1, 300, 300, 9, true, true, false), // coffee gone
		line("f", 1, 300, 300, 9, false, true, true), // off sale
	})
	if cart.SubtotalTwd != 1420 || cart.ItemCount != 3 {
		t.Fatalf("subtotal = %v, items = %d; want 1420 / 3", cart.SubtotalTwd, cart.ItemCount)
	}
	want := []struct {
		avail, changed bool
		total          int64
	}{{true, false, 900}, {true, true, 520}, {false, false, 1200}, {false, false, 300}, {false, false, 300}, {false, false, 300}}
	for i, w := range want {
		it := cart.Items[i]
		if it.Available != w.avail || it.PriceChanged != w.changed || int64(it.LineTotalTwd) != w.total {
			t.Errorf("line %s: %+v, want %+v", it.ID, it, w)
		}
	}
	if empty := buildCart(nil); empty.Items == nil || len(empty.Items) != 0 || empty.SubtotalTwd != 0 {
		t.Fatalf("empty cart = %+v", empty)
	}
}
