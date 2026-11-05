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

// Sweep lists the bucket, then reads the referenced URLs (in that order, so a
// URL saved while listing is still seen), and deletes unreferenced objects
// older than MinAge. Errors deleting single objects are counted, not fatal.
func Sweep(ctx context.Context, b Bucket, imageURLs func(context.Context) ([]string, error), now time.Time, o Options) (Result, error) {
	var res Result
	var objects []storage.Object
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
			objects = append(objects, page...)
			if next == "" {
				break
			}
			token = next
		}
	}
	res.Scanned = len(objects)
	if len(objects) == 0 {
		return res, nil
	}

	urls, err := imageURLs(ctx)
	if err != nil {
		return res, fmt.Errorf("read referenced images: %w", err)
	}
	referenced := make(map[string]bool, len(urls))
	for _, u := range urls {
		if k := storage.ImageKeyIn(u); k != "" {
			referenced[k] = true
		}
	}

	orphans := storage.Orphans(objects, referenced, now, o.MinAge)
	res.Orphans = len(orphans)
	var firstErr error
	for _, key := range orphans {
		if o.MaxDeletes > 0 && res.Deleted >= o.MaxDeletes {
			break
		}
		if err := b.DeleteObject(ctx, key); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("delete %s: %w", key, err)
			}
			if ctx.Err() != nil {
				break
			}
			continue
		}
		res.Deleted++
	}
	return res, firstErr
}
