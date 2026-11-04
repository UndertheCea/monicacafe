package graph

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/vikstrous/dataloadgen"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/platform/money"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// ─── Viewer / authorisation ───────────────────────────────────────────────────

func viewer(ctx context.Context) *auth.Claims { return middleware.ClaimsFromContext(ctx) }

func requireViewer(ctx context.Context) (*auth.Claims, error) {
	c := viewer(ctx)
	if c == nil {
		return nil, errUnauthenticated()
	}
	return c, nil
}

func isAdmin(c *auth.Claims) bool { return c != nil && c.Role == string(model.UserRoleAdmin) }

// ownedShop loads a shop and checks the viewer may manage it.
func (r *Resolver) ownedShop(ctx context.Context, c *auth.Claims, shopID string) (*store.Shop, error) {
	if !isUUID(shopID) {
		return nil, errNotFound("shop")
	}
	sh, err := r.Store.ShopByID(ctx, shopID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("shop")
	}
	if err != nil {
		return nil, err
	}
	if sh.OwnerID != c.UserID && !isAdmin(c) {
		return nil, errForbidden("you do not manage this shop")
	}
	return sh, nil
}

// ownedCoffee loads a coffee and checks the viewer manages its shop.
func (r *Resolver) ownedCoffee(ctx context.Context, c *auth.Claims, coffeeID string) (*store.Coffee, error) {
	if !isUUID(coffeeID) {
		return nil, errNotFound("coffee")
	}
	co, err := r.Store.CoffeeByID(ctx, coffeeID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("coffee")
	}
	if err != nil {
		return nil, err
	}
	if _, err := r.ownedShop(ctx, c, co.ShopID); err != nil {
		return nil, err
	}
	return co, nil
}

// canSeeDrafts reports whether the viewer may see unpublished coffees of a shop.
func (r *Resolver) canSeeDrafts(ctx context.Context, shopID string) (bool, error) {
	c := viewer(ctx)
	if c == nil {
		return false, nil
	}
	if isAdmin(c) {
		return true, nil
	}
	sh, err := r.loadersFor(ctx).ShopByID.Load(ctx, shopID)
	if err != nil {
		if isLoaderNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return sh.OwnerID == c.UserID, nil
}

func isLoaderNotFound(err error) bool {
	return errors.Is(err, dataloadgen.ErrNotFound) || errors.Is(err, store.ErrNotFound)
}

// issueTokens creates an access/refresh token pair and records the refresh token.
func (r *Resolver) issueTokens(ctx context.Context, u *store.User) (*model.AuthPayload, error) {
	access, err := r.Auth.IssueAccessToken(u.ID, u.Role)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}
	refresh, err := r.Auth.IssueRefreshToken(u.ID)
	if err != nil {
		return nil, fmt.Errorf("issue refresh token: %w", err)
	}
	if err := r.Store.SaveRefreshToken(ctx, u.ID, refresh.JTIHash, refresh.ExpiresAt); err != nil {
		return nil, fmt.Errorf("save refresh token: %w", err)
	}
	user := toUser(u)
	user.RevealEmail = true
	return &model.AuthPayload{AccessToken: access, RefreshToken: refresh.Token, User: user}, nil
}

// ─── Conversions ──────────────────────────────────────────────────────────────

func toUser(u *store.User) *model.User {
	return &model.User{
		ID: u.ID, EmailAddr: u.Email, DisplayName: u.DisplayName,
		Role: model.UserRole(u.Role), CreatedAt: u.CreatedAt,
	}
}

func toShop(s *store.Shop) *model.Shop {
	return &model.Shop{
		ID: s.ID, OwnerID: s.OwnerID, Slug: s.Slug, Name: s.Name, Description: s.Description,
		LogoURL: s.LogoURL, BannerURL: s.BannerURL, City: s.City, Lat: s.Lat, Lng: s.Lng,
		CreatedAt: s.CreatedAt,
	}
}

func toCoffee(c *store.Coffee) *model.Coffee {
	return &model.Coffee{
		ID: c.ID, ShopID: c.ShopID, Name: c.Name, Slug: c.Slug, Description: c.Description,
		OriginCountryID: c.OriginCountryID, VarietyID: c.VarietyID,
		ProcessingMethodID: c.ProcessingMethodID, RoastLevel: model.RoastLevel(c.RoastLevel),
		FlavorNotes: c.FlavorNotes, ImageUrls: c.ImageURLs, IsPublished: c.IsPublished,
		CreatedAt: c.CreatedAt,
	}
}

func toCoffees(cs []*store.Coffee) []*model.Coffee {
	out := make([]*model.Coffee, len(cs))
	for i, c := range cs {
		out[i] = toCoffee(c)
	}
	return out
}

func toVariant(v *store.Variant) *model.Variant {
	return &model.Variant{
		ID: v.ID, Grind: model.GrindOption(v.Grind), WeightG: v.WeightG,
		PriceTwd: money.TWD(v.PriceTWD), Stock: v.Stock, IsAvailable: v.IsAvailable && v.Stock > 0,
	}
}

func toComment(c *store.Comment) *model.Comment {
	return &model.Comment{ID: c.ID, UserID: c.UserID, CoffeeID: c.CoffeeID, Body: c.Body, CreatedAt: c.CreatedAt}
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

func page(limit, offset *int) (int, int) {
	l, o := defaultPageSize, 0
	if limit != nil {
		l = min(max(*limit, 1), maxPageSize)
	}
	if offset != nil && *offset > 0 {
		o = *offset
	}
	return l, o
}

// ─── Validation ───────────────────────────────────────────────────────────────

func isUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

// requireUUID validates an ID argument, reporting the field on failure.
func requireUUID(field, s string) error {
	if !isUUID(s) {
		return errBadInput(field, field+" is not a valid ID")
	}
	return nil
}

// cleanText trims s and checks its length in characters is within [min, max].
func cleanText(field, s string, minLen, maxLen int) (string, error) {
	s = strings.TrimSpace(s)
	n := utf8.RuneCountInString(s)
	if n < minLen || n > maxLen {
		if minLen > 0 {
			return "", errBadInput(field, fmt.Sprintf("%s must be %d–%d characters", field, minLen, maxLen))
		}
		return "", errBadInput(field, fmt.Sprintf("%s must be at most %d characters", field, maxLen))
	}
	return s, nil
}

func cleanOptText(field string, s *string, minLen, maxLen int) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v, err := cleanText(field, *s, minLen, maxLen)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func normaliseEmail(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	addr, err := mail.ParseAddress(s)
	if err != nil || addr.Address != s || len(s) > 254 {
		return "", errBadInput("email", "email address is invalid")
	}
	return s, nil
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func normaliseShopSlug(s string) (string, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) < 3 || len(s) > 48 || !slugRe.MatchString(s) {
		return "", errBadInput("slug", "slug must be 3–48 lowercase letters, digits or single hyphens")
	}
	return s, nil
}

// slugify derives an ASCII slug from a (possibly Chinese) name. Non-ASCII
// characters are dropped; an empty result falls back to "coffee".
func slugify(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		case b.Len() > 0 && !dash:
			b.WriteByte('-')
			dash = true
		}
	}
	s := strings.TrimSuffix(b.String(), "-")
	if len(s) > 60 {
		s = strings.TrimSuffix(s[:60], "-")
	}
	if s == "" {
		s = "coffee"
	}
	return s
}

const suffixAlphabet = "abcdefghijkmnpqrstuvwxyz23456789"

// randomSuffix returns n characters from an unambiguous lowercase alphabet.
func randomSuffix(n int) (string, error) {
	b := make([]byte, n)
	max := big.NewInt(int64(len(suffixAlphabet)))
	for i := range b {
		x, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b[i] = suffixAlphabet[x.Int64()]
	}
	return string(b), nil
}

func validateURL(field string, s *string) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v := strings.TrimSpace(*s)
	u, err := url.Parse(v)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || len(v) > 2048 {
		return nil, errBadInput(field, field+" must be an http(s) URL")
	}
	return &v, nil
}

const (
	maxFlavorNotes   = 10
	maxFlavorNoteLen = 30
)

// cleanFlavorNotes trims, de-duplicates (case-insensitively) and bounds flavor notes.
func cleanFlavorNotes(notes []string) ([]string, error) {
	if notes == nil {
		return nil, nil
	}
	out := make([]string, 0, len(notes))
	seen := make(map[string]bool, len(notes))
	for _, n := range notes {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		if utf8.RuneCountInString(n) > maxFlavorNoteLen {
			return nil, errBadInput("flavorNotes", fmt.Sprintf("each flavor note must be at most %d characters", maxFlavorNoteLen))
		}
		k := strings.ToLower(n)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, n)
	}
	if len(out) > maxFlavorNotes {
		return nil, errBadInput("flavorNotes", fmt.Sprintf("at most %d flavor notes", maxFlavorNotes))
	}
	return out, nil
}

const (
	maxVariants = 10
	maxWeightG  = 10_000
	maxPriceTWD = 1_000_000
	maxStock    = 100_000
)

func validateVariants(vs []*model.VariantInput) ([]store.CreateVariantParams, error) {
	if len(vs) == 0 || len(vs) > maxVariants {
		return nil, errBadInput("variants", fmt.Sprintf("a coffee needs 1–%d variants", maxVariants))
	}
	seen := make(map[string]bool, len(vs))
	out := make([]store.CreateVariantParams, 0, len(vs))
	for _, v := range vs {
		if !v.Grind.IsValid() {
			return nil, errBadInput("variants", "invalid grind option")
		}
		if v.WeightG <= 0 || v.WeightG > maxWeightG {
			return nil, errBadInput("variants", fmt.Sprintf("weightG must be 1–%d", maxWeightG))
		}
		if v.PriceTwd < 0 || v.PriceTwd > maxPriceTWD {
			return nil, errBadInput("variants", fmt.Sprintf("priceTwd must be 0–%d", maxPriceTWD))
		}
		if v.Stock < 0 || v.Stock > maxStock {
			return nil, errBadInput("variants", fmt.Sprintf("stock must be 0–%d", maxStock))
		}
		key := fmt.Sprintf("%s/%d", v.Grind, v.WeightG)
		if seen[key] {
			return nil, errBadInput("variants", "duplicate grind and weight combination")
		}
		seen[key] = true
		out = append(out, store.CreateVariantParams{
			Grind: string(v.Grind), WeightG: v.WeightG, PriceTWD: int64(v.PriceTwd), Stock: v.Stock,
		})
	}
	return out, nil
}

func validateCoords(lat, lng *float64) error {
	if lat != nil && (*lat < -90 || *lat > 90) {
		return errBadInput("lat", "lat must be between -90 and 90")
	}
	if lng != nil && (*lng < -180 || *lng > 180) {
		return errBadInput("lng", "lng must be between -180 and 180")
	}
	return nil
}

// maxCommentsPerCoffee caps Coffee.comments; clients use commentCount for totals.
const maxCommentsPerCoffee = 100

// validateRefs checks optional curated reference IDs exist. Nil IDs are skipped.
func (r *Resolver) validateRefs(ctx context.Context, originID, varietyID, methodID *string) error {
	refs, err := r.refs.get(ctx)
	if err != nil {
		return err
	}
	if originID != nil {
		if _, ok := refs.originBy[*originID]; !ok {
			return errBadInput("originCountryId", "unknown origin country")
		}
	}
	if varietyID != nil {
		if _, ok := refs.varietyBy[*varietyID]; !ok {
			return errBadInput("varietyId", "unknown coffee variety")
		}
	}
	if methodID != nil {
		if _, ok := refs.methodBy[*methodID]; !ok {
			return errBadInput("processingMethodId", "unknown processing method")
		}
	}
	return nil
}

// storeFilter converts and validates the public coffee filter. Only published
// coffees are ever returned through it.
func storeFilter(f *model.CoffeeFilter) (store.CoffeeFilter, error) {
	var out store.CoffeeFilter
	if f == nil {
		return out, nil
	}
	for field, id := range map[string]*string{
		"originCountryId":    f.OriginCountryID,
		"varietyId":          f.VarietyID,
		"processingMethodId": f.ProcessingMethodID,
	} {
		if id != nil {
			if err := requireUUID(field, *id); err != nil {
				return out, err
			}
		}
	}
	out.OriginCountryID, out.VarietyID, out.ProcessingMethodID = f.OriginCountryID, f.VarietyID, f.ProcessingMethodID
	if f.RoastLevel != nil {
		if !f.RoastLevel.IsValid() {
			return out, errBadInput("roastLevel", "invalid roast level")
		}
		rl := string(*f.RoastLevel)
		out.RoastLevel = &rl
	}
	if f.FlavorNote != nil {
		if note := strings.TrimSpace(*f.FlavorNote); note != "" {
			out.FlavorNote = &note
		}
	}
	if f.MinPriceTwd != nil {
		if *f.MinPriceTwd < 0 {
			return out, errBadInput("minPriceTwd", "minPriceTwd must not be negative")
		}
		v := int64(*f.MinPriceTwd)
		out.MinPriceTWD = &v
	}
	if f.MaxPriceTwd != nil {
		if *f.MaxPriceTwd < 0 {
			return out, errBadInput("maxPriceTwd", "maxPriceTwd must not be negative")
		}
		v := int64(*f.MaxPriceTwd)
		out.MaxPriceTWD = &v
	}
	if out.MinPriceTWD != nil && out.MaxPriceTWD != nil && *out.MinPriceTWD > *out.MaxPriceTWD {
		return out, errBadInput("minPriceTwd", "minPriceTwd must not exceed maxPriceTwd")
	}
	return out, nil
}
