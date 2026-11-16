package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

// StockLine is one line of an order: an option and how many bags.
type StockLine struct {
	VariantID string
	Quantity  int
}

// MaxHoldQuantity is the most bags one line can take, the same bound as
// stock_holds.quantity's CHECK (migration 027), so a bigger line is refused
// here instead of failing the INSERT with an unmapped constraint error (#326).
const MaxHoldQuantity = 1000

// ErrDuplicateLine: an order listed the same option twice; merge lines first.
var ErrDuplicateLine = errors.New("store: an option appears twice in one order")

// holdOrder returns the indexes of lines sorted by variant id, the one lock
// order every checkout uses, so two orders holding the same options in
// opposite cart order can't deadlock (#310). Bad lines are refused up front.
func holdOrder(lines []StockLine) ([]int, error) {
	idx := make([]int, len(lines))
	for i := range lines {
		if lines[i].Quantity <= 0 || lines[i].Quantity > MaxHoldQuantity {
			return nil, fmt.Errorf("store: hold %d units", lines[i].Quantity)
		}
		idx[i] = i
	}
	sort.Slice(idx, func(a, b int) bool { return lines[idx[a]].VariantID < lines[idx[b]].VariantID })
	for k := 1; k < len(idx); k++ {
		if lines[idx[k]].VariantID == lines[idx[k-1]].VariantID {
			return nil, ErrDuplicateLine
		}
	}
	return idx, nil
}

// ReserveLines takes the stock for a whole order and records one hold per
// line, returning the hold ids in the order of lines. Lines are taken in
// sorted variant-id order. If any line is short it returns
// ErrInsufficientStock and nothing is taken: inside a transaction the caller
// must roll back (it is all-or-nothing anyway when called outside one).
func (s *Store) ReserveLines(ctx context.Context, lines []StockLine) ([]string, error) {
	order, err := holdOrder(lines)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(lines))
	err = s.InTx(ctx, func(tx *Store) error {
		for _, i := range order {
			l := lines[i]
			if err := tx.ReserveStock(ctx, l.VariantID, l.Quantity); err != nil {
				return err
			}
			if err := tx.db.QueryRow(ctx, `INSERT INTO stock_holds (variant_id, quantity)
				VALUES ($1, $2) RETURNING id`, l.VariantID, l.Quantity).Scan(&ids[i]); err != nil {
				return mapErr(err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return ids, nil
}

// ReleaseHold gives a hold's bags back exactly once: it marks the hold
// released and returns its stock in one statement. A hold already released
// reports false and changes nothing (a retried job, a duplicate callback);
// an unknown id is ErrNotFound.
func (s *Store) ReleaseHold(ctx context.Context, holdID string) (bool, error) {
	tag, err := s.db.Exec(ctx, `
		WITH h AS (
			UPDATE stock_holds SET released_at = now()
			WHERE id = $1 AND released_at IS NULL
			RETURNING variant_id, quantity
		)
		UPDATE variants v SET stock = v.stock + h.quantity FROM h WHERE v.id = h.variant_id`, holdID)
	if err != nil {
		return false, mapErr(err)
	}
	if tag.RowsAffected() > 0 {
		return true, nil
	}
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM stock_holds WHERE id = $1)`, holdID).Scan(&exists); err != nil {
		return false, mapErr(err)
	}
	if !exists {
		return false, ErrNotFound
	}
	return false, nil
}
