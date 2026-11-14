package store

import (
	"context"
	"time"
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
}

// CartVariantByID loads an option with what the cart needs to know about it.
func (s *Store) CartVariantByID(ctx context.Context, variantID string) (*CartVariant, error) {
	var cv CartVariant
	v := &cv.Variant
	err := s.db.QueryRow(ctx, `
		SELECT v.id, v.coffee_id, v.grind, v.weight_g, v.price_twd, v.stock, v.is_available, v.updated_at,
			v.archived_at IS NULL, `+publicCoffee+`
		FROM variants v JOIN coffees c ON c.id = v.coffee_id
		WHERE v.id = $1`, variantID).Scan(&v.ID, &v.CoffeeID, &v.Grind, &v.WeightG, &v.PriceTWD, &v.Stock,
		&v.IsAvailable, &v.UpdatedAt, &cv.VariantLive, &cv.CoffeePublic)
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

// SetCartLine creates the buyer's line for an option or replaces its quantity,
// taking priceTWD as the new price snapshot.
func (s *Store) SetCartLine(ctx context.Context, userID, variantID string, quantity int, priceTWD int64) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO cart_items (user_id, variant_id, quantity, price_twd)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT ON CONSTRAINT cart_items_user_variant_key DO UPDATE
		SET quantity = EXCLUDED.quantity, price_twd = EXCLUDED.price_twd, updated_at = now()`,
		userID, variantID, quantity, priceTWD)
	return mapErr(err)
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
