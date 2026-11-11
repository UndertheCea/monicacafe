package store

import "time"

// User is a registered account.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	DisplayName  string
	Role         string // BUYER | SELLER | ADMIN
	CreatedAt    time.Time
	// SuspendedAt: an admin suspended the account (#224); nil = active.
	SuspendedAt *time.Time
	// TokenVersion is carried in access tokens; bumping it ends them for writes.
	TokenVersion int
}

// Shop is a seller storefront.
type Shop struct {
	ID          string
	OwnerID     string
	Slug        string
	Name        string
	Description string
	LogoURL     *string
	BannerURL   *string
	City        string
	Lat         *float64
	Lng         *float64
	CreatedAt   time.Time
	UpdatedAt   time.Time
	// SuspendedAt: an admin took the shop off the site (#224); nil = active.
	SuspendedAt *time.Time
}

// Coffee is a coffee listing belonging to a shop.
type Coffee struct {
	ID                 string
	ShopID             string
	Name               string
	Slug               string
	Description        string
	OriginCountryID    string
	VarietyID          *string
	ProcessingMethodID string
	RoastLevel         *string // EXTRA_LIGHT | LIGHT | MEDIUM | MEDIUM_DARK | DARK; nil = not given (#176)
	FlavorNotes        []string
	ImageURLs          []string
	IsPublished        bool
	CreatedAt          time.Time
	UpdatedAt          time.Time // also moves when a variant changes (migration 006)
	// Provenance (migration 010): blank text / nil altitude = not given. A
	// single growing altitude has only AltitudeMinM.
	Producer     string
	Region       string
	AltitudeMinM *int
	AltitudeMaxM *int
	// BrewMethod (migration 011): FILTER | ESPRESSO | OMNI; nil = not given.
	BrewMethod *string
	// HarvestYear (migration 012): the crop year; nil = not given.
	HarvestYear *int
	// ShopSuspended: the coffee's shop was taken off the site (#224).
	ShopSuspended bool
}

// Public reports whether anyone may see the coffee: published, and its shop
// isn't suspended. Owners and admins still see it through canSeeDrafts.
func (c *Coffee) Public() bool { return c.IsPublished && !c.ShopSuspended }

// Variant is a purchasable size/grind of a coffee.
type Variant struct {
	ID          string
	CoffeeID    string
	Grind       string // WHOLE_BEAN | COARSE | MEDIUM | FINE | ESPRESSO
	WeightG     int
	PriceTWD    int64
	Stock       int
	IsAvailable bool
}

// Comment is a buyer comment on a coffee.
type Comment struct {
	ID        string
	UserID    string
	CoffeeID  string
	Body      string
	CreatedAt time.Time
	EditedAt  *time.Time // nil until the author edits the text
	FromShop  bool       // the author owns the coffee's shop (computed on read)
}

// OriginCountry is curated reference data.
type OriginCountry struct {
	ID     string
	NameEn string
	NameZh string
	Region string
}

// CoffeeVariety is curated reference data.
type CoffeeVariety struct {
	ID          string
	Name        string
	Description *string
}

// ProcessingMethod is curated reference data.
type ProcessingMethod struct {
	ID          string
	NameEn      string
	NameZh      string
	Description *string
}
