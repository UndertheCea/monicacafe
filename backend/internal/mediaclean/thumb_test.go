package mediaclean

import (
	"context"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/storage"
)

// TestSweepThumbnails: a thumbnail lives exactly as long as its original is
// referenced (#235). The fake reference check mimics the database: a key is
// referenced when it is a substring of a saved URL.
func TestSweepThumbnails(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old := now.Add(-48 * time.Hour)
	kept, gone := key("shops/", 1), key("shops/", 2)
	keptThumb, goneThumb := storage.ThumbKey(kept), storage.ThumbKey(gone)
	saved := []string{"http://localhost/media/" + kept}

	cases := []struct {
		name    string
		objects []storage.Object
		want    []string
	}{
		{"thumbnail of a referenced original stays",
			[]storage.Object{{Key: kept, LastModified: old}, {Key: keptThumb, LastModified: old}}, nil},
		{"thumbnail of an orphan goes with it",
			[]storage.Object{{Key: gone, LastModified: old}, {Key: goneThumb, LastModified: old}}, []string{gone, goneThumb}},
		{"thumbnail whose original is missing is an orphan",
			[]storage.Object{{Key: goneThumb, LastModified: old}}, []string{goneThumb}},
		{"thumbnail of a referenced original stays even when the original is not listed",
			[]storage.Object{{Key: keptThumb, LastModified: old}}, nil},
	}
	for _, c := range cases {
		var events []string
		b := &fakeBucket{pages: map[string][][]storage.Object{"shops/": {c.objects}}, events: &events}
		refs := func(_ context.Context, keys []string) ([]string, error) {
			var out []string
			for _, k := range keys {
				if slices.ContainsFunc(saved, func(u string) bool { return strings.Contains(u, k) }) {
					out = append(out, k)
				}
			}
			return out, nil
		}
		_, err := Sweep(context.Background(), b, refs, now, Options{MinAge: 24 * time.Hour, Prefixes: []string{"shops/"}})
		if err != nil || !slices.Equal(b.deleted, c.want) {
			t.Errorf("%s: deleted %v (err %v), want %v", c.name, b.deleted, err, c.want)
		}
	}
}
