// Package mediaclean deletes images in the media bucket that no shop or
// coffee references any more: photos of deleted coffees, replaced logos and
// banners, images removed from a gallery, and presigned uploads that were
// never saved (#29).
package mediaclean

import (
	"context"
	"errors"
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
	// MaxFraction refuses the run when more than this share (0..1) of the
	// listed objects would be deleted (#288). 0 turns the check off; the
	// "database references nothing" check always applies.
	MaxFraction float64
	// DryRun counts and logs what would go but deletes nothing.
	DryRun bool
}

// Result counts what a sweep did. Referenced is how many of the old-enough
// listed images the database still points at; Refused is the reason a run
// deleted nothing because the numbers looked wrong ("" when it went ahead).
type Result struct {
	Scanned, Orphans, Deleted int
	Referenced                int
	DryRun                    bool
	Refused                   string
}

// ErrRefused wraps the error Sweep returns when Decide says the run looks
// wrong (an empty or wrong database, or a far larger share than usual).
var ErrRefused = errors.New("mediaclean: sweep refused")

// smallRun is the largest orphan count the fraction check never blocks: with a
// handful of objects one stray upload is a big share, and little is at risk.
const smallRun = 10

// Decide is the safety catch of the sweep, as a pure function of the counts of
// one whole listing: scanned objects (all prefixes), candidates (old enough and
// shaped like ours), orphans among them (to be deleted). It returns "" to go
// ahead or the reason to refuse:
//   - candidates exist but the database references none of them: an empty,
//     half-restored or wrong database looks exactly like this;
//   - orphans are over maxFraction of scanned (0 = no limit) and above smallRun.
func Decide(scanned, candidates, orphans int, maxFraction float64) string {
	if orphans == 0 {
		return ""
	}
	if candidates > 0 && orphans >= candidates {
		return "the database references none of the listed images"
	}
	if maxFraction > 0 && orphans > smallRun && scanned > 0 && float64(orphans)/float64(scanned) > maxFraction {
		return fmt.Sprintf("%d of %d listed objects (%.0f%%) would be deleted, over the %.0f%% limit",
			orphans, scanned, 100*float64(orphans)/float64(scanned), 100*maxFraction)
	}
	return ""
}

// Prefixes are the only parts of the bucket the sweep looks at.
var Prefixes = []string{"shops/", "coffees/"}

// Referenced reports which of keys a saved shop or coffee still points at.
type Referenced func(ctx context.Context, keys []string) ([]string, error)

// Sweep walks the whole bucket listing one page at a time (never holding more
// than a page of objects in memory). For each page it picks the objects that
// are old enough and shaped like ours, and asks the database which of those
// are still referenced; the rest are orphans. Listing precedes the reference
// read for the same page, so a URL saved in between is still seen; later
// uploads are protected by MinAge. Only when the listing is complete does
// Decide judge the counts (#288): a run that looks wrong (nothing referenced,
// or too large a share orphaned) deletes nothing and returns ErrRefused. With
// DryRun it stops there. Otherwise it deletes the orphans, at most MaxDeletes
// (the rest waits for the next run). Errors deleting single objects are
// counted, not fatal.
func Sweep(ctx context.Context, b Bucket, referenced Referenced, now time.Time, o Options) (Result, error) {
	res := Result{DryRun: o.DryRun}
	prefixes := o.Prefixes
	if len(prefixes) == 0 {
		prefixes = Prefixes
	}
	var plan []string // orphans to delete this run, capped at MaxDeletes
	candidates := 0
	for _, prefix := range prefixes {
		token := ""
		for {
			page, next, err := b.ListObjects(ctx, prefix, token)
			if err != nil {
				return res, fmt.Errorf("list %s: %w", prefix, err)
			}
			res.Scanned += len(page)
			if cands := storage.Orphans(page, nil, now, o.MinAge); len(cands) > 0 {
				candidates += len(cands)
				// A thumbnail is referenced iff its original is (#235): ask about
				// the original's stem, once per image.
				var ask []string
				seen := map[string]bool{}
				for _, c := range cands {
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
				for _, key := range cands {
					if keep[storage.ReferenceKey(key)] {
						res.Referenced++
						continue
					}
					res.Orphans++
					if o.MaxDeletes <= 0 || len(plan) < o.MaxDeletes {
						plan = append(plan, key)
					}
				}
			}
			if next == "" {
				break
			}
			token = next
		}
	}
	if why := Decide(res.Scanned, candidates, res.Orphans, o.MaxFraction); why != "" {
		res.Refused = why
		return res, fmt.Errorf("%w: %s", ErrRefused, why)
	}
	if o.DryRun {
		return res, nil
	}
	var firstErr error
	for _, key := range plan {
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
	return res, firstErr
}
