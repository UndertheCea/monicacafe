package store

import (
	"context"
	"encoding/json"
)

// exportSQL builds one JSON document with everything stored about a user
// (#270): the account, active sessions, comments, saves, follows, cart (#21), reports
// filed, account events from the audit log and, for a seller, the shop with
// its coffees and options. Secrets (password hash, token hashes, token
// version) and other people's data (who handled a report, who acted in the
// audit log, other users' comments) are left out on purpose; a test checks
// the keys. One statement, so the document is one consistent snapshot.
const exportSQL = `
SELECT jsonb_build_object(
  'exportedAt', now(),
  'account', jsonb_build_object(
    'id', u.id, 'email', u.email, 'displayName', u.display_name, 'role', u.role,
    'suspended', u.suspended_at IS NOT NULL, 'createdAt', u.created_at, 'updatedAt', u.updated_at),
  'sessions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'signedInAt', rt.created_at, 'expiresAt', rt.expires_at) ORDER BY rt.created_at)
    FROM refresh_tokens rt
    WHERE rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.expires_at > now()), '[]'::jsonb),
  'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', cm.id, 'coffeeId', cm.coffee_id, 'coffeeName', c.name, 'body', cm.body,
      'createdAt', cm.created_at, 'editedAt', cm.edited_at) ORDER BY cm.created_at, cm.id)
    FROM comments cm JOIN coffees c ON c.id = cm.coffee_id
    WHERE cm.user_id = u.id), '[]'::jsonb),
  'savedCoffees', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'coffeeId', sv.coffee_id, 'coffeeName', c.name, 'savedAt', sv.created_at) ORDER BY sv.created_at, sv.id)
    FROM saved_coffees sv JOIN coffees c ON c.id = sv.coffee_id
    WHERE sv.user_id = u.id), '[]'::jsonb),
  'followedShops', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'shopSlug', s.slug, 'shopName', s.name, 'followedAt', f.created_at) ORDER BY f.created_at, f.id)
    FROM shop_follows f JOIN shops s ON s.id = f.shop_id
    WHERE f.user_id = u.id), '[]'::jsonb),
  'cart', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'coffeeId', c.id, 'coffeeName', c.name, 'grind', v.grind, 'weightG', v.weight_g,
      'quantity', ci.quantity, 'priceTwdWhenAdded', ci.price_twd, 'addedAt', ci.created_at,
      'updatedAt', ci.updated_at) ORDER BY ci.created_at, ci.id)
    FROM cart_items ci JOIN variants v ON v.id = ci.variant_id JOIN coffees c ON c.id = v.coffee_id
    WHERE ci.user_id = u.id), '[]'::jsonb),
  'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'targetType', r.target_type, 'targetId', r.target_id, 'reason', r.reason, 'note', r.note,
      'status', r.status, 'createdAt', r.created_at, 'handledAt', r.handled_at) ORDER BY r.created_at, r.id)
    FROM reports r WHERE r.reporter_id = u.id), '[]'::jsonb),
  'accountEvents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'action', a.action, 'reason', a.reason, 'at', a.created_at) ORDER BY a.created_at, a.id)
    FROM audit_log a WHERE a.target_type = 'USER' AND a.target_id = u.id), '[]'::jsonb),
  'shop', (SELECT jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'city', s.city,
      'lat', s.lat, 'lng', s.lng, 'logoUrl', s.logo_url, 'bannerUrl', s.banner_url,
      'suspended', s.suspended_at IS NOT NULL, 'createdAt', s.created_at, 'updatedAt', s.updated_at,
      'coffees', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'slug', c.slug, 'description', c.description,
          'origin', o.name_en, 'variety', cv.name, 'process', pm.name_en, 'roastLevel', c.roast_level,
          'flavorNotes', c.flavor_notes, 'producer', c.producer, 'region', c.region,
          'altitudeMinM', c.altitude_min_m, 'altitudeMaxM', c.altitude_max_m,
          'brewMethod', c.brew_method, 'harvestYear', c.harvest_year, 'imageUrls', c.image_urls,
          'published', c.is_published, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
          'options', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'grind', v.grind, 'weightG', v.weight_g, 'priceTwd', v.price_twd, 'stock', v.stock,
              'available', v.is_available) ORDER BY v.created_at, v.id)
            FROM variants v WHERE v.coffee_id = c.id), '[]'::jsonb)
        ) ORDER BY c.shop_position, c.created_at, c.id)
        FROM coffees c
        JOIN origin_countries o ON o.id = c.origin_country_id
        JOIN processing_methods pm ON pm.id = c.processing_method_id
        LEFT JOIN coffee_varieties cv ON cv.id = c.variety_id
        WHERE c.shop_id = s.id), '[]'::jsonb))
    FROM shops s WHERE s.owner_id = u.id)
)
FROM users u WHERE u.id = $1`

// ExportUserData returns everything stored about the user as one JSON
// document (#270), or ErrNotFound when the account doesn't exist.
func (s *Store) ExportUserData(ctx context.Context, userID string) (json.RawMessage, error) {
	var doc []byte
	if err := s.db.QueryRow(ctx, exportSQL, userID).Scan(&doc); err != nil {
		return nil, mapErr(err)
	}
	return doc, nil
}
