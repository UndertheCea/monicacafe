package graph

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/vikstrous/dataloadgen"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/auth"
	"github.com/underthecea/monicacafe/backend/internal/middleware"
	"github.com/underthecea/monicacafe/backend/internal/platform/money"
	"github.com/underthecea/monicacafe/backend/internal/platform/tz"
	"github.com/underthecea/monicacafe/backend/internal/storage"
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
	refresh, err := r.Auth.IssueRefreshToken(u.ID)
	if err != nil {
		return nil, fmt.Errorf("issue refresh token: %w", err)
	}
	if err := r.Store.SaveRefreshToken(ctx, u.ID, refresh.JTIHash, refresh.ExpiresAt); err != nil {
		return nil, fmt.Errorf("save refresh token: %w", err)
	}
	return r.authPayload(u, refresh.Token)
}

// authPayload pairs a fresh access token with an already-recorded refresh token.
func (r *Resolver) authPayload(u *store.User, refreshToken string) (*model.AuthPayload, error) {
	access, err := r.Auth.IssueAccessToken(u.ID, u.Role)
	if err != nil {
		return nil, fmt.Errorf("issue access token: %w", err)
	}
	user := toUser(u)
	user.RevealEmail = true
	return &model.AuthPayload{AccessToken: access, RefreshToken: refreshToken, User: user}, nil
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
		CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
}

func toCoffee(c *store.Coffee) *model.Coffee {
	return &model.Coffee{
		ID: c.ID, ShopID: c.ShopID, Name: c.Name, Slug: c.Slug, Description: c.Description,
		OriginCountryID: c.OriginCountryID, VarietyID: c.VarietyID,
		ProcessingMethodID: c.ProcessingMethodID, RoastLevel: model.RoastLevel(c.RoastLevel),
		FlavorNotes: c.FlavorNotes, ImageUrls: c.ImageURLs, IsPublished: c.IsPublished,
		CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		Producer: c.Producer, Region: c.Region, AltitudeMinM: c.AltitudeMinM, AltitudeMaxM: c.AltitudeMaxM,
		BrewMethod: toBrewMethod(c.BrewMethod), HarvestYear: c.HarvestYear,
		Acidity: c.Acidity, Sweetness: c.Sweetness, Body: c.Body,
	}
}

// toBrewMethod maps the stored brew method; nil or an unknown value (the
// DB CHECK makes that impossible today) is "not given".
func toBrewMethod(s *string) *model.BrewMethod {
	if s == nil {
		return nil
	}
	m := model.BrewMethod(*s)
	if !m.IsValid() {
		return nil
	}
	return &m
}

// brewMethodsMatching lists the stored brew methods a buyer asking for m
// should see: an omni roast suits filter and espresso alike, but asking for
// omni means "works both ways", so it matches only OMNI.
func brewMethodsMatching(m model.BrewMethod) []string {
	switch m {
	case model.BrewMethodFilter, model.BrewMethodEspresso:
		return []string{string(m), string(model.BrewMethodOmni)}
	default:
		return []string{string(m)}
	}
}

// brewMethodParam validates an optional brew method for the store; nil stays
// nil (not given).
func brewMethodParam(m *model.BrewMethod) (*string, error) {
	if m == nil {
		return nil, nil
	}
	if !m.IsValid() {
		return nil, errBadInput("brewMethod", "invalid brew method")
	}
	s := string(*m)
	return &s, nil
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
	return &model.Comment{ID: c.ID, UserID: c.UserID, CoffeeID: c.CoffeeID, Body: c.Body, CreatedAt: c.CreatedAt, EditedAt: c.EditedAt, FromShop: c.FromShop}
}

func toComments(cs []*store.Comment) []*model.Comment {
	out := make([]*model.Comment, len(cs))
	for i, c := range cs {
		out[i] = toComment(c)
	}
	return out
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

// similarLimit clamps Coffee.similar's limit: default 4, between 1 and 12.
func similarLimit(limit *int) int {
	if limit == nil {
		return 4
	}
	return min(max(*limit, 1), 12)
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

// validatePasswordChange checks a changePassword input before any database
// work: the new password must meet the strength rule and differ from the
// current one.
func validatePasswordChange(current, next string) error {
	if current == "" {
		return errBadInput("currentPassword", "current password is required")
	}
	if err := auth.ValidatePassword(next); err != nil {
		return errBadInput("newPassword", err.Error())
	}
	if next == current {
		return errBadInput("newPassword", "new password must differ from the current one")
	}
	return nil
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

// maxCoffeeName is the longest coffee name (runes) the API accepts.
const maxCoffeeName = 120

// Provenance limits (migration 010 repeats them as CHECKs).
const (
	maxProvenanceText = 100
	maxAltitudeM      = 6000
)

// validateAltitude checks a growing altitude in metres: both nil (not given),
// a single height (min only) or a range with max ≥ min, all within
// 0–maxAltitudeM. A max without a min is an error.
func validateAltitude(minM, maxM *int) error {
	if minM == nil {
		if maxM != nil {
			return errBadInput("altitudeMinM", "give the lowest altitude before the highest")
		}
		return nil
	}
	if *minM < 0 || *minM > maxAltitudeM {
		return errBadInput("altitudeMinM", fmt.Sprintf("altitude must be 0–%d m", maxAltitudeM))
	}
	if maxM != nil {
		if *maxM < 0 || *maxM > maxAltitudeM {
			return errBadInput("altitudeMaxM", fmt.Sprintf("altitude must be 0–%d m", maxAltitudeM))
		}
		if *maxM < *minM {
			return errBadInput("altitudeMaxM", "the highest altitude can't be below the lowest")
		}
	}
	return nil
}

// Harvest years (migration 012's CHECK is the wider 2000–2100).
const (
	minHarvestYear = 2000
	maxHarvestYear = 2100
)

// validateHarvestYear checks an optional crop year: nil is "not given";
// otherwise minHarvestYear through the current year in Taipei, because a
// crop can't be harvested in the future.
func validateHarvestYear(field string, year *int, now time.Time) error {
	if year == nil {
		return nil
	}
	latest := tz.ToTaipei(now).Year()
	if *year < minHarvestYear || *year > latest {
		return errBadInput(field, fmt.Sprintf("harvest year must be %d–%d", minHarvestYear, latest))
	}
	return nil
}

// Cup profile scales (migration 013's CHECK): 1 (low) to 5 (high).
const (
	minCupScale = 1
	maxCupScale = 5
)

// cupProfileParam validates a CupProfileInput: each scale nil or 1–5, and at
// least one set (removing the profile is clearCupProfile's job, so an empty
// input is a mistake rather than a silent clear). nil input is "not given".
func cupProfileParam(in *model.CupProfileInput) (store.CupProfile, error) {
	if in == nil {
		return store.CupProfile{}, nil
	}
	if in.Acidity == nil && in.Sweetness == nil && in.Body == nil {
		return store.CupProfile{}, errBadInput("cupProfile", "set at least one of acidity, sweetness, body (or use clearCupProfile)")
	}
	for _, s := range []struct {
		field string
		v     *int
	}{{"acidity", in.Acidity}, {"sweetness", in.Sweetness}, {"body", in.Body}} {
		if s.v != nil && (*s.v < minCupScale || *s.v > maxCupScale) {
			return store.CupProfile{}, errBadInput(s.field, fmt.Sprintf("%s must be %d–%d", s.field, minCupScale, maxCupScale))
		}
	}
	return store.CupProfile{Acidity: in.Acidity, Sweetness: in.Sweetness, Body: in.Body}, nil
}

// cleanProvenance trims the optional producer / region texts; nil stays "".
func cleanProvenance(producer, region *string) (string, string, error) {
	var p, rg string
	var err error
	if producer != nil {
		if p, err = cleanText("producer", *producer, 0, maxProvenanceText); err != nil {
			return "", "", err
		}
	}
	if region != nil {
		if rg, err = cleanText("region", *region, 0, maxProvenanceText); err != nil {
			return "", "", err
		}
	}
	return p, rg, nil
}

// copyName appends suffix to name, trimming the end of name (by runes, then
// trailing spaces) so the result fits maxCoffeeName.
func copyName(name, suffix string) string {
	room := maxCoffeeName - utf8.RuneCountInString(suffix)
	if r := []rune(name); len(r) > room {
		name = strings.TrimRight(string(r[:room]), " ")
	}
	return name + suffix
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

// mediaURL validates an optional image URL: "" (clear) or a URL served from
// the configured bucket under keyPrefix, i.e. one createImageUpload issued for
// this shop or coffee. Arbitrary hosts are refused so sellers can't hot-link
// (or link out) and the CSP can stay narrow.
func (r *Resolver) mediaURL(field string, s *string, keyPrefix string) (*string, error) {
	if s == nil {
		return nil, nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return &v, nil
	}
	if err := r.checkMediaURL(field, v, keyPrefix); err != nil {
		return nil, err
	}
	return &v, nil
}

func (r *Resolver) checkMediaURL(field, v, keyPrefix string) error {
	if r.Media == nil {
		return errBadInput(field, "image uploads are not configured on this server")
	}
	if len(v) > 2048 || !strings.HasPrefix(r.Media.KeyOf(v), keyPrefix) {
		return errBadInput(field, field+" must be an image uploaded for this listing")
	}
	return nil
}

const maxCoffeeImages = 8

// coffeeImageURLs validates a replacement gallery. nil = unchanged.
func (r *Resolver) coffeeImageURLs(urls []string, coffeeID string) ([]string, error) {
	if urls == nil {
		return nil, nil
	}
	out := make([]string, 0, len(urls))
	seen := make(map[string]bool, len(urls))
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if seen[u] {
			continue
		}
		if err := r.checkMediaURL("imageUrls", u, storage.CoffeePrefix(coffeeID)); err != nil {
			return nil, err
		}
		seen[u] = true
		out = append(out, u)
	}
	if len(out) > maxCoffeeImages {
		return nil, errBadInput("imageUrls", fmt.Sprintf("at most %d photos", maxCoffeeImages))
	}
	return out, nil
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
		p, err := validateVariant(v)
		if err != nil {
			return nil, err
		}
		key := fmt.Sprintf("%s/%d", p.Grind, p.WeightG)
		if seen[key] {
			return nil, errBadInput("variants", "duplicate grind and weight combination")
		}
		seen[key] = true
		out = append(out, p)
	}
	return out, nil
}

// validateVariant checks one new variant's fields.
func validateVariant(v *model.VariantInput) (store.CreateVariantParams, error) {
	if v == nil || !v.Grind.IsValid() {
		return store.CreateVariantParams{}, errBadInput("variants", "invalid grind option")
	}
	if v.WeightG <= 0 || v.WeightG > maxWeightG {
		return store.CreateVariantParams{}, errBadInput("variants", fmt.Sprintf("weightG must be 1–%d", maxWeightG))
	}
	if err := checkPrice(v.PriceTwd); err != nil {
		return store.CreateVariantParams{}, err
	}
	if err := checkStock(v.Stock); err != nil {
		return store.CreateVariantParams{}, err
	}
	return store.CreateVariantParams{
		Grind: string(v.Grind), WeightG: v.WeightG, PriceTWD: int64(v.PriceTwd), Stock: v.Stock,
	}, nil
}

func checkPrice(p int) error {
	if p < 0 || p > maxPriceTWD {
		return errBadInput("variants", fmt.Sprintf("priceTwd must be 0–%d", maxPriceTWD))
	}
	return nil
}

func checkStock(n int) error {
	if n < 0 || n > maxStock {
		return errBadInput("variants", fmt.Sprintf("stock must be 0–%d", maxStock))
	}
	return nil
}

// validateVariantUpdate checks a partial variant update. At least one field
// must be set.
func validateVariantUpdate(in model.UpdateVariantInput) (store.UpdateVariantParams, error) {
	var p store.UpdateVariantParams
	if in.PriceTwd == nil && in.Stock == nil && in.IsAvailable == nil {
		return p, errBadInput("input", "nothing to update")
	}
	if in.PriceTwd != nil {
		if err := checkPrice(*in.PriceTwd); err != nil {
			return p, err
		}
		price := int64(*in.PriceTwd)
		p.PriceTWD = &price
	}
	if in.Stock != nil {
		if err := checkStock(*in.Stock); err != nil {
			return p, err
		}
		p.Stock = in.Stock
	}
	p.IsAvailable = in.IsAvailable
	return p, nil
}

// ownedVariant loads a variant and checks the viewer manages its coffee's shop.
func (r *Resolver) ownedVariant(ctx context.Context, c *auth.Claims, variantID string) (*store.Variant, error) {
	if !isUUID(variantID) {
		return nil, errNotFound("variant")
	}
	v, err := r.Store.VariantByID(ctx, variantID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, errNotFound("variant")
	}
	if err != nil {
		return nil, err
	}
	if _, err := r.ownedCoffee(ctx, c, v.CoffeeID); err != nil {
		return nil, err
	}
	return v, nil
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

// storeSort maps the public sort enum onto the store's (nil = newest first).
func storeSort(s *model.CoffeeSort) (store.CoffeeSort, error) {
	if s == nil {
		return store.SortNewest, nil
	}
	switch *s {
	case model.CoffeeSortNewest:
		return store.SortNewest, nil
	case model.CoffeeSortPriceAsc:
		return store.SortPriceAsc, nil
	case model.CoffeeSortPriceDesc:
		return store.SortPriceDesc, nil
	case model.CoffeeSortMostDiscussed:
		return store.SortMostDiscussed, nil
	case model.CoffeeSortMostSaved:
		return store.SortMostSaved, nil
	}
	return store.SortNewest, errBadInput("sort", "invalid sort")
}

// storeShopSort maps the public shop sort to the store's whitelisted order.
func storeShopSort(s *model.ShopSort) (store.ShopSort, error) {
	if s == nil {
		return store.ShopSortNewest, nil
	}
	switch *s {
	case model.ShopSortNewest:
		return store.ShopSortNewest, nil
	case model.ShopSortName:
		return store.ShopSortName, nil
	case model.ShopSortMostCoffees:
		return store.ShopSortMostCoffees, nil
	case model.ShopSortMostFollowed:
		return store.ShopSortMostFollowed, nil
	}
	return store.ShopSortNewest, errBadInput("sort", "invalid sort")
}

const (
	maxSearchLen   = 100
	maxSearchTerms = 8
)

// searchTerms splits a search string into its whitespace-separated words
// (nil for a blank one). Duplicates are dropped case-insensitively; the caps
// keep a query from turning into dozens of ILIKE scans.
func searchTerms(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) > maxSearchLen {
		return nil, errBadInput("search", fmt.Sprintf("search must be at most %d characters", maxSearchLen))
	}
	var out []string
	seen := map[string]bool{}
	for _, w := range strings.Fields(s) {
		k := strings.ToLower(w)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, w)
	}
	if len(out) > maxSearchTerms {
		return nil, errBadInput("search", fmt.Sprintf("search may have at most %d words", maxSearchTerms))
	}
	return out, nil
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
	if f.Search != nil {
		terms, err := searchTerms(*f.Search)
		if err != nil {
			return out, err
		}
		out.SearchTerms = terms
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
	out.InStock = f.InStock != nil && *f.InStock
	if f.BrewMethod != nil {
		if !f.BrewMethod.IsValid() {
			return out, errBadInput("brewMethod", "invalid brew method")
		}
		out.BrewMethods = brewMethodsMatching(*f.BrewMethod)
	}
	if f.MinHarvestYear != nil {
		// Not capped at the current year: asking for next year's crop is just
		// an empty list, not a mistake.
		if y := *f.MinHarvestYear; y < minHarvestYear || y > maxHarvestYear {
			return out, errBadInput("minHarvestYear", fmt.Sprintf("minHarvestYear must be %d–%d", minHarvestYear, maxHarvestYear))
		}
		out.MinHarvestYear = f.MinHarvestYear
	}
	for _, sc := range []struct {
		field string
		in    *int
		out   **int
	}{
		{"maxAcidity", f.MaxAcidity, &out.MaxAcidity},
		{"minSweetness", f.MinSweetness, &out.MinSweetness},
		{"minBody", f.MinBody, &out.MinBody},
		{"maxBody", f.MaxBody, &out.MaxBody},
	} {
		if sc.in == nil {
			continue
		}
		if v := *sc.in; v < minCupScale || v > maxCupScale {
			return out, errBadInput(sc.field, fmt.Sprintf("%s must be %d–%d", sc.field, minCupScale, maxCupScale))
		}
		*sc.out = sc.in
	}
	if out.MinBody != nil && out.MaxBody != nil && *out.MinBody > *out.MaxBody {
		return out, errBadInput("minBody", "minBody must not exceed maxBody")
	}
	if out.MinPriceTWD != nil && out.MaxPriceTWD != nil && *out.MinPriceTWD > *out.MaxPriceTWD {
		return out, errBadInput("minPriceTwd", "minPriceTwd must not exceed maxPriceTwd")
	}
	return out, nil
}

// toShopPin maps a store pin to the GraphQL type. A coordinate pair is only
// exposed when both halves are present and in range: half a location (or a
// corrupt one) cannot be plotted, so the map lists such shops without a pin.
func toShopPin(p *store.ShopPin) *model.ShopPin {
	out := &model.ShopPin{ID: p.ID, Slug: p.Slug, Name: p.Name, City: p.City}
	if p.Lat != nil && p.Lng != nil && validateCoords(p.Lat, p.Lng) == nil {
		out.Lat, out.Lng = p.Lat, p.Lng
	}
	return out
}
