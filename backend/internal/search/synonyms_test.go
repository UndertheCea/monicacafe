package search

import (
	"reflect"
	"strings"
	"testing"
)

func TestExpand(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"unknown word stays alone", "ristretto", []string{"ristretto"}},
		{"english finds chinese", "Yirgacheffe", []string{"Yirgacheffe", "Yirgachefe", "耶加雪菲", "耶加雪啡"}},
		{"case and punctuation ignored", "yirga-cheffe,", []string{"yirga-cheffe,", "Yirgacheffe", "Yirgachefe", "耶加雪菲", "耶加雪啡"}},
		{"chinese finds english", "瑰夏", []string{"瑰夏", "Geisha", "Gesha", "藝伎", "藝妓"}},
		{"alternative spelling", "gesha", []string{"gesha", "Geisha", "瑰夏", "藝伎", "藝妓"}},
		{"accents folded", "narino", []string{"narino", "Nariño", "納里尼奧", "娜玲珠"}},
		{"simplified folds to traditional and its group", "埃塞俄比亚", []string{"埃塞俄比亚", "埃塞俄比亞", "Ethiopia", "衣索比亞"}},
		{"simplified with no group still folds", "厌氧发酵", []string{"厌氧发酵", "厭氧發酵"}},
		{"mainland name of a country", "肯尼亚", []string{"肯尼亚", "肯尼亞", "Kenya", "肯亞"}},
		{"tasting note", "茉莉", []string{"茉莉", "Jasmine", "茉莉花"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Expand(tc.in); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("Expand(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// TestGroups keeps the table well-formed: no term in two groups (Expand would
// pick one silently), no group larger than the cap, no simplified characters
// left in a member (they could never match after folding).
func TestGroups(t *testing.T) {
	seen := map[string]int{}
	for i, g := range groups {
		if len(g) < 2 || len(g) > MaxAlternatives-1 {
			t.Errorf("group %d %q: %d members, want 2..%d", i, g, len(g), MaxAlternatives-1)
		}
		for _, term := range g {
			k := key(term)
			if k == "" {
				t.Errorf("group %d: %q has an empty key", i, term)
			}
			if j, ok := seen[k]; ok && j != i {
				t.Errorf("%q is in groups %d and %d", term, j, i)
			}
			seen[k] = i
			if Traditional(term) != term {
				t.Errorf("group %d: %q contains simplified characters", i, term)
			}
		}
	}
	for s, tr := range simplified {
		if s == tr {
			t.Errorf("simplified[%q] maps to itself", s)
		}
		if _, ok := simplified[tr]; ok {
			t.Errorf("simplified[%q] = %q, which is itself mapped", s, tr)
		}
	}
}

func TestExpandCap(t *testing.T) {
	for _, g := range groups {
		for _, term := range g {
			for _, w := range []string{term, strings.ToUpper(term) + "!"} {
				if n := len(Expand(w)); n > MaxAlternatives {
					t.Errorf("Expand(%q) has %d alternatives, cap %d", w, n, MaxAlternatives)
				}
			}
		}
	}
}
