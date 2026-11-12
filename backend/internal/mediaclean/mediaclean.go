// Package mediaclean deletes images in the media bucket that no shop or
// coffee references any more: photos of deleted coffees, replaced logos and
// banners, images removed from a gallery, and presigned uploads that were
// never saved (#29).
package mediaclean

import (
	"context"
	"fmt"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/storage"
)

// Bucket is the slice of storage.Media the sweep needs.
type Bucket interface {
	ListObjects(ctx context.Context, prefix, continuation string) ([]storage.Object, string, error)
	DeleteObject(ctx context.Context, key string) error
}

// Options tune one sweep.
type Options struct {
	// MinAge protects recent uploads that may not be saved yet. Presigned
	// URLs live 10 minutes; a day leaves room for a form left open.
	MinAge time.Duration
	// MaxDeletes caps one run, bounding the damage of a bad reference read.
	MaxDeletes int
	// Prefixes to sweep; defaults to Prefixes (tests narrow it to their own).
	Prefixes []string
}

// Result counts what a sweep did.
type Result struct {
	Scanned, Orphans, Deleted int
}

// Prefixes are the only parts of the bucket the sweep looks at.
var Prefixes = []string{"shops/", "coffees/"}

// Referenced reports which of keys a saved shop or coffee still points at.
type Referenced func(ctx context.Context, keys []string) ([]string, error)

// Sweep walks the bucket one listing page at a time (never holding more than a
// page in memory). For each page it picks the objects that are old enough and
// shaped like ours, asks the database which of those are still referenced, and
// deletes the rest. Listing precedes the reference read for the same page, so
// a URL saved in between is still seen; later uploads are protected by MinAge.
// Errors deleting single objects are counted, not fatal; the run stops once
// MaxDeletes objects are gone and the next run continues.
func Sweep(ctx context.Context, b Bucket, referenced Referenced, now time.Time, o Options) (Result, error) {
	var res Result
	var firstErr error
	prefixes := o.Prefixes
	if len(prefixes) == 0 {
		prefixes = Prefixes
	}
	for _, prefix := range prefixes {
		token := ""
		for {
			page, next, err := b.ListObjects(ctx, prefix, token)
			if err != nil {
				return res, fmt.Errorf("list %s: %w", prefix, err)
			}
			res.Scanned += len(page)
			if candidates := storage.Orphans(page, nil, now, o.MinAge); len(candidates) > 0 {
				// A thumbnail is referenced iff its original is (#235): ask about
				// the original's stem, once per image.
				var ask []string
				seen := map[string]bool{}
				for _, c := range candidates {
					if k := storage.ReferenceKey(c); !seen[k] {
						seen[k] = true
						ask = append(ask, k)
					}
				}
				refs, err := referenced(ctx, ask)
				if err != nil {
					return res, fmt.Errorf("read referenced images: %w", err)
				}
				keep := make(map[string]bool, len(refs))
				for _, k := range refs {
					keep[k] = true
				}
				for _, key := range candidates {
					if keep[storage.ReferenceKey(key)] {
						continue
					}
					res.Orphans++
					if o.MaxDeletes > 0 && res.Deleted >= o.MaxDeletes {
						return res, firstErr
					}
					if err := b.DeleteObject(ctx, key); err != nil {
						if firstErr == nil {
							firstErr = fmt.Errorf("delete %s: %w", key, err)
						}
						if ctx.Err() != nil {
							return res, firstErr
						}
						continue
					}
					res.Deleted++
				}
			}
			if next == "" {
				break
			}
			token = next
		}
	}
	return res, firstErr
}
