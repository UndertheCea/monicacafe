package store

import (
	"fmt"
	"testing"
)

func TestShopFilterWhere(t *testing.T) {
	city := "台北市"
	const term = "(s.name ILIKE $%[1]d OR s.description ILIKE $%[1]d)"
	cases := []struct {
		name string
		f    ShopFilter
		want string
		args []any
	}{
		{"no filter", ShopFilter{}, "", nil},
		{"city", ShopFilter{City: &city}, " WHERE s.city = $1", []any{city}},
		{"one term, escaped", ShopFilter{SearchTerms: []string{"50%_"}}, " WHERE " + fmt.Sprintf(term, 1), []any{`%50\%\_%`}},
		{"city + two terms", ShopFilter{City: &city, SearchTerms: []string{"豆", "Roast"}},
			" WHERE s.city = $1 AND " + fmt.Sprintf(term, 2) + " AND " + fmt.Sprintf(term, 3),
			[]any{city, "%豆%", "%Roast%"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, args := tc.f.where()
			if got != tc.want || fmt.Sprint(args) != fmt.Sprint(tc.args) {
				t.Errorf("where() = %q %v, want %q %v", got, args, tc.want, tc.args)
			}
		})
	}
}
