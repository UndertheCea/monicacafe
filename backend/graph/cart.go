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

// MinCartPriceTWD: anything that goes in a cart costs at least NT$1, because
// ECPay refuses zero-amount trades (owner's default 2a on #292).
const MinCartPriceTWD = 1

// lineBuyable reports whether a cart line could be checked out now.
func lineBuyable(l *store.CartLine) bool {
	return l.VariantLive && l.CoffeePublic && l.Variant.IsAvailable && l.Variant.Stock >= l.Quantity &&
		l.Variant.PriceTWD >= MinCartPriceTWD
}

// cartMax is the most bags one line may hold for an option with this stock.
func cartMax(stock int) int { return min(store.MaxCartQuantity, stock) }

// cartAddProblem checks buyer `viewerID` adding `add` bags of cv to a cart
// that already holds `have` of it in a cart of `lines` lines.
func cartAddProblem(cv *store.CartVariant, viewerID string, have, add, lines int) error {
	if !cv.CoffeePublic || !cv.VariantLive {
		return errNotFound("variant")
	}
	if cv.ShopOwnerID == viewerID {
		return errOwnShop() // no self-purchase (owner's default 3a on #292)
	}
	if add < 1 || add > store.MaxCartQuantity {
		return errBadInput("quantity", fmt.Sprintf("quantity must be 1–%d", store.MaxCartQuantity))
	}
	if cv.Variant.PriceTWD < MinCartPriceTWD {
		return errBadInput("variantId", "this option has no price and can't be bought")
	}
	if !cv.Variant.IsAvailable || cv.Variant.Stock < 1 {
		return errBadInput("variantId", "this option is not on sale or is sold out")
	}
	if have+add > cartMax(cv.Variant.Stock) {
		return errNotEnough(cartMax(cv.Variant.Stock) - have)
	}
	if have == 0 && lines >= store.MaxCartLines {
		return errLimitReached("cart", fmt.Sprintf("a cart holds at most %d options", store.MaxCartLines))
	}
	return nil
}

// cartUpdateProblem checks changing a line to `qty` bags: lowering always
// works, raising must fit the stock of a buyable option (the same price floor
// as adding, #319).
func cartUpdateProblem(l *store.CartLine, qty int) error {
	if qty < 1 || qty > store.MaxCartQuantity {
		return errBadInput("quantity", fmt.Sprintf("quantity must be 1–%d", store.MaxCartQuantity))
	}
	if qty <= l.Quantity {
		return nil
	}
	if !l.VariantLive || !l.CoffeePublic || !l.Variant.IsAvailable || l.Variant.PriceTWD < MinCartPriceTWD {
		return errNotEnough(0)
	}
	if qty > cartMax(l.Variant.Stock) {
		return errNotEnough(cartMax(l.Variant.Stock))
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
		have, lineID := 0, ""
		if l, err := tx.CartLineForVariant(ctx, c.UserID, variantID); err == nil {
			have, lineID = l.Quantity, l.ID
		} else if !errors.Is(err, store.ErrNotFound) {
			return err
		}
		lines, err := tx.CountCartLines(ctx, c.UserID)
		if err != nil {
			return err
		}
		if err := cartAddProblem(cv, c.UserID, have, quantity, lines); err != nil {
			return err
		}
		// A new line snapshots today's price; adding to a line keeps its
		// snapshot, so a "price changed" notice stays until it is accepted.
		// Only the quantity changes, so a price accepted meanwhile stays (#379);
		// a line the hourly sweep removed since it was read starts again.
		if lineID != "" {
			err := tx.SetCartLineQuantity(ctx, c.UserID, lineID, have+quantity)
			if !errors.Is(err, store.ErrNotFound) {
				return err
			}
		}
		return tx.SetCartLine(ctx, c.UserID, variantID, quantity, cv.Variant.PriceTWD)
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
		// The snapshot stays: only acceptCartPrice takes today's price (#291),
		// and one it took meanwhile isn't overwritten (#379).
		err = tx.SetCartLineQuantity(ctx, c.UserID, l.ID, quantity)
		if errors.Is(err, store.ErrNotFound) {
			return errNotFound("cart item")
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return r.loadCart(ctx, c.UserID)
}

// acceptCartPrice takes today's price as the line's snapshot: the buyer saw
// "price changed" and agreed to the new price (#291).
func (r *Resolver) acceptCartPrice(ctx context.Context, id string, expected money.TWD) (*model.Cart, error) {
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
	// Under the cart lock like every other cart write, so an add or a
	// quantity change can't interleave with it (#379).
	err = r.Store.InTx(ctx, func(tx *store.Store) error {
		if err := tx.LockCart(ctx, c.UserID); err != nil {
			return err
		}
		return tx.AcceptCartPrice(ctx, c.UserID, id, int64(expected))
	})
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("cart item")
	} else if errors.Is(err, store.ErrPriceMoved) {
		return nil, errBadInput("expectedPriceTwd", "the price changed again; check the new price")
	} else if err != nil {
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
	err = r.Store.InTx(ctx, func(tx *store.Store) error {
		if err := tx.LockCart(ctx, c.UserID); err != nil {
			return err
		}
		return tx.DeleteCartLine(ctx, c.UserID, id)
	})
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("cart item")
	} else if err != nil {
		return nil, err
	}
	return r.loadCart(ctx, c.UserID)
}
