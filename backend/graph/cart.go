package graph

import (
	"context"
	"errors"
	"fmt"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/platform/money"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// Cart (#21). The rules live in pure functions (cartAddProblem,
// cartUpdateProblem, buildCart) so they are table-tested without a database.

// lineBuyable reports whether a cart line could be checked out now.
func lineBuyable(l *store.CartLine) bool {
	return l.VariantLive && l.CoffeePublic && l.Variant.IsAvailable && l.Variant.Stock >= l.Quantity
}

// cartMax is the most bags one line may hold for an option with this stock.
func cartMax(stock int) int { return min(store.MaxCartQuantity, stock) }

// cartAddProblem checks adding `add` bags of cv to a cart that already holds
// `have` of it in a cart of `lines` lines.
func cartAddProblem(cv *store.CartVariant, have, add, lines int) error {
	if !cv.CoffeePublic || !cv.VariantLive {
		return errNotFound("variant")
	}
	if add < 1 || add > store.MaxCartQuantity {
		return errBadInput("quantity", fmt.Sprintf("quantity must be 1–%d", store.MaxCartQuantity))
	}
	if !cv.Variant.IsAvailable || cv.Variant.Stock < 1 {
		return errBadInput("variantId", "this option is not on sale or is sold out")
	}
	if have+add > cartMax(cv.Variant.Stock) {
		return errBadInput("quantity", fmt.Sprintf("at most %d of this option fit in a cart", cartMax(cv.Variant.Stock)))
	}
	if have == 0 && lines >= store.MaxCartLines {
		return errLimitReached("cart", fmt.Sprintf("a cart holds at most %d options", store.MaxCartLines))
	}
	return nil
}

// cartUpdateProblem checks changing a line to `qty` bags: lowering always
// works, raising must fit the stock of a buyable option.
func cartUpdateProblem(l *store.CartLine, qty int) error {
	if qty < 1 || qty > store.MaxCartQuantity {
		return errBadInput("quantity", fmt.Sprintf("quantity must be 1–%d", store.MaxCartQuantity))
	}
	if qty <= l.Quantity {
		return nil
	}
	if !l.VariantLive || !l.CoffeePublic || !l.Variant.IsAvailable || qty > cartMax(l.Variant.Stock) {
		return errBadInput("quantity", "not enough of this option left")
	}
	return nil
}

// buildCart turns store lines into the API cart; only buyable lines count
// towards the subtotal and item count.
func buildCart(lines []*store.CartLine) *model.Cart {
	cart := &model.Cart{Items: make([]*model.CartItem, 0, len(lines))}
	for _, l := range lines {
		ok := lineBuyable(l)
		price := money.TWD(l.Variant.PriceTWD)
		total := price * money.TWD(l.Quantity)
		cart.Items = append(cart.Items, &model.CartItem{
			ID:            l.ID,
			Quantity:      l.Quantity,
			Variant:       toVariant(&l.Variant),
			CoffeeID:      l.Variant.CoffeeID,
			AddedPriceTwd: money.TWD(l.AddedPriceTWD),
			PriceTwd:      price,
			PriceChanged:  l.AddedPriceTWD != l.Variant.PriceTWD,
			Available:     ok,
			LineTotalTwd:  total,
		})
		if ok {
			cart.SubtotalTwd += total
			cart.ItemCount += l.Quantity
		}
	}
	return cart
}

func (r *Resolver) loadCart(ctx context.Context, userID string) (*model.Cart, error) {
	lines, err := r.Store.CartLines(ctx, userID)
	if err != nil {
		return nil, err
	}
	return buildCart(lines), nil
}

func (r *Resolver) addToCart(ctx context.Context, variantID string, quantity int) (*model.Cart, error) {
	c, err := requireViewer(ctx)
	if err != nil {
		return nil, err
	}
	if err := allowKey(r.Limits.CartUser, c.UserID); err != nil {
		return nil, err
	}
	if !isUUID(variantID) {
		return nil, errNotFound("variant")
	}
	err = r.Store.InTx(ctx, func(tx *store.Store) error {
		if err := tx.LockCart(ctx, c.UserID); err != nil {
			return err
		}
		cv, err := tx.CartVariantByID(ctx, variantID)
		if errors.Is(err, store.ErrNotFound) {
			return errNotFound("variant")
		}
		if err != nil {
			return err
		}
		have := 0
		if l, err := tx.CartLineForVariant(ctx, c.UserID, variantID); err == nil {
			have = l.Quantity
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		lines, err := tx.CountCartLines(ctx, c.UserID)
		if err != nil {
			return err
		}
		if err := cartAddProblem(cv, have, quantity, lines); err != nil {
			return err
		}
		return tx.SetCartLine(ctx, c.UserID, variantID, have+quantity, cv.Variant.PriceTWD)
	})
	if err != nil {
		return nil, err
	}
	return r.loadCart(ctx, c.UserID)
}

func (r *Resolver) updateCartItem(ctx context.Context, id string, quantity int) (*model.Cart, error) {
	c, err := requireViewer(ctx)
	if err != nil {
		return nil, err
	}
	if err := allowKey(r.Limits.CartUser, c.UserID); err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("cart item")
	}
	err = r.Store.InTx(ctx, func(tx *store.Store) error {
		if err := tx.LockCart(ctx, c.UserID); err != nil {
			return err
		}
		l, err := tx.CartLineByID(ctx, c.UserID, id)
		if errors.Is(err, store.ErrNotFound) {
			return errNotFound("cart item")
		}
		if err != nil {
			return err
		}
		if err := cartUpdateProblem(l, quantity); err != nil {
			return err
		}
		return tx.SetCartLine(ctx, c.UserID, l.Variant.ID, quantity, l.Variant.PriceTWD)
	})
	if err != nil {
		return nil, err
	}
	return r.loadCart(ctx, c.UserID)
}

func (r *Resolver) removeFromCart(ctx context.Context, id string) (*model.Cart, error) {
	c, err := requireViewer(ctx)
	if err != nil {
		return nil, err
	}
	if err := allowKey(r.Limits.CartUser, c.UserID); err != nil {
		return nil, err
	}
	if !isUUID(id) {
		return nil, errNotFound("cart item")
	}
	if err := r.Store.DeleteCartLine(ctx, c.UserID, id); errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("cart item")
	} else if err != nil {
		return nil, err
	}
	return r.loadCart(ctx, c.UserID)
}
