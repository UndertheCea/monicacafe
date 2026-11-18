package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Cart limits (#21). The DB CHECK on cart_items.quantity matches
// MaxCartQuantity; the line cap is enforced under LockCart.
const (
	MaxCartLines    = 50
	MaxCartQuantity = 20
)

// CartLine is one cart row joined with its option and coffee.
type CartLine struct {
	ID            string
	Quantity      int
	AddedPriceTWD int64
	UpdatedAt     time.Time
	Variant       Variant
	// VariantLive: the option isn't archived.
	VariantLive bool
	// CoffeePublic: published, not archived, shop not suspended.
	CoffeePublic bool
	ShopID       string
}

const cartLineSelect = `
	SELECT ci.id, ci.quantity, ci.price_twd, ci.updated_at,
		v.id, v.coffee_id, v.grind, v.weight_g, v.price_twd, v.stock, v.is_available, v.updated_at,
		v.archived_at IS NULL, ` + publicCoffee + `, c.shop_id
	FROM cart_items ci
	JOIN variants v ON v.id = ci.variant_id
	JOIN coffees c ON c.id = v.coffee_id`

func scanCartLine(row interface{ Scan(...any) error }) (*CartLine, error) {
	var l CartLine
	v := &l.Variant
	if err := row.Scan(&l.ID, &l.Quantity, &l.AddedPriceTWD, &l.UpdatedAt,
		&v.ID, &v.CoffeeID, &v.Grind, &v.WeightG, &v.PriceTWD, &v.Stock, &v.IsAvailable, &v.UpdatedAt,
		&l.VariantLive, &l.CoffeePublic, &l.ShopID); err != nil {
		return nil, mapErr(err)
	}
	return &l, nil
}

// CartLines returns a buyer's cart, oldest line first.
func (s *Store) CartLines(ctx context.Context, userID string) ([]*CartLine, error) {
	rows, err := s.db.Query(ctx, cartLineSelect+` WHERE ci.user_id = $1 ORDER BY ci.created_at, ci.id`, userID)
	if err != nil {
		return nil, mapErr(err)
	}
	defer rows.Close()
	var out []*CartLine
	for rows.Next() {
		l, err := scanCartLine(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, mapErr(rows.Err())
}

// CartLineByID returns one of the buyer's cart lines; another buyer's line
// is ErrNotFound.
func (s *Store) CartLineByID(ctx context.Context, userID, id string) (*CartLine, error) {
	return scanCartLine(s.db.QueryRow(ctx, cartLineSelect+` WHERE ci.user_id = $1 AND ci.id = $2`, userID, id))
}

// CartLineForVariant returns the buyer's line for an option, or ErrNotFound.
func (s *Store) CartLineForVariant(ctx context.Context, userID, variantID string) (*CartLine, error) {
	return scanCartLine(s.db.QueryRow(ctx, cartLineSelect+` WHERE ci.user_id = $1 AND ci.variant_id = $2`, userID, variantID))
}

// CartVariant describes an option for adding it to a cart.
type CartVariant struct {
	Variant      Variant
	VariantLive  bool
	CoffeePublic bool
	// ShopOwnerID: the account that owns the coffee's shop.
	ShopOwnerID string
}

// CartVariantByID loads an option with what the cart needs to know about it.
func (s *Store) CartVariantByID(ctx context.Context, variantID string) (*CartVariant, error) {
	var cv CartVariant
	v := &cv.Variant
	err := s.db.QueryRow(ctx, `
		SELECT v.id, v.coffee_id, v.grind, v.weight_g, v.price_twd, v.stock, v.is_available, v.updated_at,
			v.archived_at IS NULL, `+publicCoffee+`, sh.owner_id
		FROM variants v JOIN coffees c ON c.id = v.coffee_id JOIN shops sh ON sh.id = c.shop_id
		WHERE v.id = $1`, variantID).Scan(&v.ID, &v.CoffeeID, &v.Grind, &v.WeightG, &v.PriceTWD, &v.Stock,
		&v.IsAvailable, &v.UpdatedAt, &cv.VariantLive, &cv.CoffeePublic, &cv.ShopOwnerID)
	if err != nil {
		return nil, mapErr(err)
	}
	return &cv, nil
}

// LockCart serialises cart writes for one buyer until the transaction ends,
// so two tabs can't both pass the line cap. Call it inside InTx.
func (s *Store) LockCart(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('cart:' || $1::text, 0))`, userID)
	return mapErr(err)
}

// CountCartLines counts a buyer's cart lines.
func (s *Store) CountCartLines(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.db.QueryRow(ctx, `SELECT count(*) FROM cart_items WHERE user_id = $1`, userID).Scan(&n)
	return n, mapErr(err)
}

// SetCartLine creates the buyer's line for an option, snapshotting priceTWD.
// On an existing line it replaces quantity and snapshot; changes to a line
// use SetCartLineQuantity instead (#379).
func (s *Store) SetCartLine(ctx context.Context, userID, variantID string, quantity int, priceTWD int64) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO cart_items (user_id, variant_id, quantity, price_twd)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT ON CONSTRAINT cart_items_user_variant_key DO UPDATE
		SET quantity = EXCLUDED.quantity, price_twd = EXCLUDED.price_twd, updated_at = now()`,
		userID, variantID, quantity, priceTWD)
	return mapErr(err)
}

// SetCartLineQuantity changes the quantity of one of the buyer's lines and
// leaves its price snapshot alone, so a price accepted meanwhile (or by
// another tab) isn't written back to the old one. ErrNotFound if the line
// isn't theirs or is gone (removed, or pruned).
func (s *Store) SetCartLineQuantity(ctx context.Context, userID, id string, quantity int) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE cart_items SET quantity = $3, updated_at = now() WHERE user_id = $1 AND id = $2`,
		userID, id, quantity)
	if err != nil {
		return mapErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ErrPriceMoved: the option's price is no longer the one the buyer accepted.
var ErrPriceMoved = errors.New("store: price changed again")

// AcceptCartPrice sets a line's price snapshot to the option's price today,
// only while that price equals expected (what the buyer was shown, #371).
// ErrNotFound if the line isn't the buyer's; ErrPriceMoved if the price
// changed since.
func (s *Store) AcceptCartPrice(ctx context.Context, userID, id string, expected int64) error {
	var current int64
	err := s.db.QueryRow(ctx, `
		WITH upd AS (
			UPDATE cart_items ci SET price_twd = v.price_twd, updated_at = now()
			FROM variants v
			WHERE v.id = ci.variant_id AND ci.user_id = $1 AND ci.id = $2 AND v.price_twd = $3
			RETURNING ci.price_twd)
		SELECT price_twd FROM upd
		UNION ALL
		SELECT v.price_twd FROM cart_items ci JOIN variants v ON v.id = ci.variant_id
		WHERE ci.user_id = $1 AND ci.id = $2 AND NOT EXISTS (SELECT 1 FROM upd)`,
		userID, id, expected).Scan(&current)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return mapErr(err)
	}
	if current != expected {
		return ErrPriceMoved
	}
	return nil
}

// CartLineMaxAge: a line nobody touched for this long is removed by the
// hourly sweep (owner's default 4a on #292; #291).
const CartLineMaxAge = 90 * 24 * time.Hour

// PruneStaleCartLines deletes up to batch lines not changed for maxAge.
func (s *Store) PruneStaleCartLines(ctx context.Context, maxAge time.Duration, batch int) (int64, error) {
	tag, err := s.db.Exec(ctx, `
		DELETE FROM cart_items WHERE id IN (
			SELECT id FROM cart_items WHERE updated_at < now() - $1::interval LIMIT $2)`,
		fmt.Sprintf("%d seconds", int64(maxAge.Seconds())), batch)
	if err != nil {
		return 0, mapErr(err)
	}
	return tag.RowsAffected(), nil
}

// DeleteCartLine removes one of the buyer's lines. ErrNotFound if it isn't theirs.
func (s *Store) DeleteCartLine(ctx context.Context, userID, id string) error {
	tag, err := s.db.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1 AND id = $2`, userID, id)
	if err != nil {
		return mapErr(err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
