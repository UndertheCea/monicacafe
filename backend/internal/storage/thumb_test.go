package storage

import (
	"testing"
	"time"
)

func TestThumbKey(t *testing.T) {
	const thumbShop = "shops/0b6f9a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b/logo-0123456789abcdef01234567.thumb.webp"
	const thumbCoffee = "coffees/1c7a0b6f-4d2e-4f30-8b9c-8d7e6f5a4b3c/photo-89abcdef0123456789abcdef.thumb.webp"
	cases := []struct{ name, in, thumb, ref string }{
		{"jpg original", shopKey, thumbShop, shopKey},
		{"webp original", coffeeKey, thumbCoffee, coffeeKey},
		{"foreign key has no thumbnail", "shops/readme.txt", "", "shops/readme.txt"},
		{"a thumbnail has no thumbnail", thumbCoffee, "", "coffees/1c7a0b6f-4d2e-4f30-8b9c-8d7e6f5a4b3c/photo-89abcdef0123456789abcdef"},
	}
	for _, c := range cases {
		if got := ThumbKey(c.in); got != c.thumb {
			t.Errorf("%s: ThumbKey(%q) = %q, want %q", c.name, c.in, got, c.thumb)
		}
		if got := ReferenceKey(c.in); got != c.ref {
			t.Errorf("%s: ReferenceKey(%q) = %q, want %q", c.name, c.in, got, c.ref)
		}
		if c.thumb != "" && (!IsThumbKey(c.thumb) || IsThumbKey(c.in) || ImageKeyIn(c.thumb) != "") {
			t.Errorf("%s: %q must be a thumbnail key and never a saveable image key", c.name, c.thumb)
		}
	}
}

func TestOrphansIncludesThumbnails(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old, fresh := now.Add(-48*time.Hour), now.Add(-time.Hour)
	thumb := ThumbKey(shopKey)
	cases := []struct {
		name string
		obj  Object
		want int
	}{
		{"old thumbnail is a candidate", Object{thumb, old}, 1},
		{"young thumbnail is kept", Object{thumb, fresh}, 0},
	}
	for _, c := range cases {
		if got := Orphans([]Object{c.obj}, nil, now, 24*time.Hour); len(got) != c.want {
			t.Errorf("%s: Orphans = %v", c.name, got)
		}
	}
}
