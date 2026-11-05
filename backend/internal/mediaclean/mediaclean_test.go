package mediaclean

import (
	"context"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/storage"
)

func key(prefix string, n int) string {
	return prefix + "0b6f9a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b/img-" + string(rune('a'+n)) + "0123456789abcdef0123456" + ".jpg"
}

type fakeBucket struct {
	pages   map[string][][]storage.Object // prefix → pages
	deleted []string
	failOn  string
	listErr error
	events  *[]string
}

func (b *fakeBucket) ListObjects(_ context.Context, prefix, token string) ([]storage.Object, string, error) {
	*b.events = append(*b.events, "list")
	if b.listErr != nil {
		return nil, "", b.listErr
	}
	pages := b.pages[prefix]
	i := 0
	if token != "" {
		i = int(token[0] - '0')
	}
	if i >= len(pages) {
		return nil, "", nil
	}
	next := ""
	if i+1 < len(pages) {
		next = string(rune('0' + i + 1))
	}
	return pages[i], next, nil
}

func (b *fakeBucket) DeleteObject(_ context.Context, k string) error {
	if k == b.failOn {
		return errors.New("boom")
	}
	b.deleted = append(b.deleted, k)
	return nil
}

func TestSweep(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old := now.Add(-48 * time.Hour)
	s0, s1, c0, c1 := key("shops/", 0), key("shops/", 1), key("coffees/", 2), key("coffees/", 3)
	pages := map[string][][]storage.Object{
		"shops/":   {{{Key: s0, LastModified: old}}, {{Key: s1, LastModified: old}}}, // two pages
		"coffees/": {{{Key: c0, LastModified: old}, {Key: c1, LastModified: now}}},
	}
	refs := []string{"http://localhost/media/" + s1}

	cases := []struct {
		name        string
		opts        Options
		failOn      string
		listErr     error
		wantDeleted []string
		want        Result
		wantErr     bool
	}{
		{"deletes old unreferenced across pages", Options{MinAge: 24 * time.Hour}, "", nil,
			[]string{s0, c0}, Result{Scanned: 4, Orphans: 2, Deleted: 2}, false},
		{"cap per run", Options{MinAge: 24 * time.Hour, MaxDeletes: 1}, "", nil,
			[]string{s0}, Result{Scanned: 4, Orphans: 2, Deleted: 1}, false},
		{"one failed delete doesn't stop the rest", Options{MinAge: 24 * time.Hour}, s0, nil,
			[]string{c0}, Result{Scanned: 4, Orphans: 2, Deleted: 1}, true},
		{"narrowed prefixes", Options{MinAge: 24 * time.Hour, Prefixes: []string{"coffees/"}}, "", nil,
			[]string{c0}, Result{Scanned: 2, Orphans: 1, Deleted: 1}, false},
		{"listing error deletes nothing", Options{}, "", errors.New("down"), nil, Result{}, true},
	}
	for _, c := range cases {
		var events []string
		b := &fakeBucket{pages: pages, failOn: c.failOn, listErr: c.listErr, events: &events}
		got, err := Sweep(context.Background(), b, func(context.Context) ([]string, error) {
			events = append(events, "refs")
			return refs, nil
		}, now, c.opts)
		if (err != nil) != c.wantErr || got != c.want || !slices.Equal(b.deleted, c.wantDeleted) {
			t.Errorf("%s: got %+v deleted %v err %v; want %+v deleted %v", c.name, got, b.deleted, err, c.want, c.wantDeleted)
		}
		if c.listErr == nil && (len(events) == 0 || events[len(events)-1] != "refs") {
			t.Errorf("%s: references must be read after listing, events %v", c.name, events)
		}
	}
}

func TestSweepReferenceErrorDeletesNothing(t *testing.T) {
	var events []string
	b := &fakeBucket{pages: map[string][][]storage.Object{"shops/": {{{Key: key("shops/", 0), LastModified: time.Unix(0, 0)}}}}, events: &events}
	_, err := Sweep(context.Background(), b, func(context.Context) ([]string, error) { return nil, errors.New("db down") }, time.Now(), Options{})
	if err == nil || len(b.deleted) != 0 {
		t.Fatalf("err %v, deleted %v", err, b.deleted)
	}
}
