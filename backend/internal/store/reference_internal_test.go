package store

import (
	"reflect"
	"testing"
)

func TestAddReferenceCount(t *testing.T) {
	s := func(v string) *string { return &v }
	type row struct {
		origin, variety, method *string
		n                       int
	}
	cases := []struct {
		name string
		rows []row
		want ReferenceCoffeeCounts
	}{
		{"empty", nil, ReferenceCoffeeCounts{Origins: map[string]int{}, Varieties: map[string]int{}, Methods: map[string]int{}}},
		{"one per set", []row{{s("o1"), nil, nil, 2}, {nil, s("v1"), nil, 1}, {nil, nil, s("m1"), 3}},
			ReferenceCoffeeCounts{Origins: map[string]int{"o1": 2}, Varieties: map[string]int{"v1": 1}, Methods: map[string]int{"m1": 3}}},
		{"no-variety group ignored", []row{{nil, nil, nil, 4}, {nil, s("v1"), nil, 1}},
			ReferenceCoffeeCounts{Origins: map[string]int{}, Varieties: map[string]int{"v1": 1}, Methods: map[string]int{}}},
		{"same id, same set adds up", []row{{s("o1"), nil, nil, 2}, {s("o1"), nil, nil, 1}, {s("o2"), nil, nil, 1}},
			ReferenceCoffeeCounts{Origins: map[string]int{"o1": 3, "o2": 1}, Varieties: map[string]int{}, Methods: map[string]int{}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ReferenceCoffeeCounts{Origins: map[string]int{}, Varieties: map[string]int{}, Methods: map[string]int{}}
			for _, r := range tc.rows {
				addReferenceCount(&got, r.origin, r.variety, r.method, r.n)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}
