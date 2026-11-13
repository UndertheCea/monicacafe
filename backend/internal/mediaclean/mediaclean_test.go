package mediaclean

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/storage"
)

func key(prefix string, n int) string {
	return prefix + "0b6f9a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b/img-" + fmt.Sprintf("%024x", n) + ".jpg"
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

// refsFrom answers Referenced from a fixed set of keys and logs each call.
func refsFrom(events *[]string, calls *[][]string, refd ...string) Referenced {
	return func(_ context.Context, keys []string) ([]string, error) {
		*events = append(*events, "refs")
		*calls = append(*calls, slices.Clone(keys))
		var out []string
		for _, k := range keys {
			if slices.Contains(refd, k) {
				out = append(out, k)
			}
		}
		return out, nil
	}
}

func TestSweep(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old := now.Add(-48 * time.Hour)
	s0, s1, c0, c1 := key("shops/", 0), key("shops/", 1), key("coffees/", 2), key("coffees/", 3)
	pages := map[string][][]storage.Object{
		"shops/":   {{{Key: s0, LastModified: old}}, {{Key: s1, LastModified: old}}}, // two pages
		"coffees/": {{{Key: c0, LastModified: old}, {Key: c1, LastModified: now}}},
	}

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
		{"cap per run: stops at the next orphan", Options{MinAge: 24 * time.Hour, MaxDeletes: 1}, "", nil,
			[]string{s0}, Result{Scanned: 4, Orphans: 2, Deleted: 1}, false},
		{"one failed delete doesn't stop the rest", Options{MinAge: 24 * time.Hour}, s0, nil,
			[]string{c0}, Result{Scanned: 4, Orphans: 2, Deleted: 1}, true},
		{"narrowed prefixes", Options{MinAge: 24 * time.Hour, Prefixes: []string{"coffees/"}}, "", nil,
			[]string{c0}, Result{Scanned: 2, Orphans: 1, Deleted: 1}, false},
		{"listing error deletes nothing", Options{}, "", errors.New("down"), nil, Result{}, true},
	}
	for _, c := range cases {
		var events []string
		var calls [][]string
		b := &fakeBucket{pages: pages, failOn: c.failOn, listErr: c.listErr, events: &events}
		got, err := Sweep(context.Background(), b, refsFrom(&events, &calls, s1), now, c.opts)
		if (err != nil) != c.wantErr || got != c.want || !slices.Equal(b.deleted, c.wantDeleted) {
			t.Errorf("%s: got %+v deleted %v err %v; want %+v deleted %v", c.name, got, b.deleted, err, c.want, c.wantDeleted)
		}
		for _, call := range calls {
			if slices.Contains(call, c1) {
				t.Errorf("%s: a too-young object was sent to the reference check: %v", c.name, call)
			}
		}
	}
}

// TestSweepPagesThroughALargeBucket: a bucket of many pages is processed one
// page at a time (references are asked per page, never for the whole bucket),
// and an object referenced on a later page survives.
func TestSweepPagesThroughALargeBucket(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old := now.Add(-48 * time.Hour)
	const perPage, nPages = 4, 5
	var pages [][]storage.Object
	var all []string
	for p := range nPages {
		var page []storage.Object
		for i := range perPage {
			k := key("shops/", p*perPage+i)
			page = append(page, storage.Object{Key: k, LastModified: old})
			all = append(all, k)
		}
		pages = append(pages, page)
	}
	kept := all[nPages*perPage-2] // on the last page
	var events []string
	var calls [][]string
	b := &fakeBucket{pages: map[string][][]storage.Object{"shops/": pages}, events: &events}
	got, err := Sweep(context.Background(), b, refsFrom(&events, &calls, kept), now, Options{MinAge: time.Hour, Prefixes: []string{"shops/"}})
	if err != nil {
		t.Fatal(err)
	}
	want := Result{Scanned: nPages * perPage, Orphans: nPages*perPage - 1, Deleted: nPages*perPage - 1}
	if got != want {
		t.Errorf("got %+v, want %+v", got, want)
	}
	if len(calls) != nPages {
		t.Fatalf("%d reference checks, want one per page (%d)", len(calls), nPages)
	}
	for i, call := range calls {
		if len(call) > perPage {
			t.Errorf("reference check %d held %d keys, more than a page", i, len(call))
		}
	}
	if slices.Contains(b.deleted, kept) {
		t.Errorf("referenced %s was deleted", kept)
	}
	// Listing and checking alternate: the second page is listed after the
	// first page's references were read.
	if want := []string{"list", "refs", "list", "refs"}; !slices.Equal(events[:4], want) {
		t.Errorf("events start %v, want %v", events[:4], want)
	}
}

func TestSweepReferenceErrorDeletesNothing(t *testing.T) {
	var events []string
	b := &fakeBucket{pages: map[string][][]storage.Object{"shops/": {{{Key: key("shops/", 0), LastModified: time.Unix(0, 0)}}}}, events: &events}
	_, err := Sweep(context.Background(), b, func(context.Context, []string) ([]string, error) { return nil, errors.New("db down") }, time.Now(), Options{})
	if err == nil || len(b.deleted) != 0 {
		t.Fatalf("err %v, deleted %v", err, b.deleted)
	}
}
