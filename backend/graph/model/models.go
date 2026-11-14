package model

import (
	"time"

	"github.com/underthecea/monicacafe/backend/internal/platform/money"
)

// Hand-written GraphQL models. Relationship fields (User.shop, Shop.coffees,
// Coffee.shop/variants/comments/…, Comment.user) are deliberately absent so that
// gqlgen generates field resolvers for them; those resolvers load related data
// lazily through request-scoped dataloaders. Foreign keys are kept on the
// structs (json:"-") for the resolvers to use.

type User struct {
	ID        string `json:"id"`
	EmailAddr string `json:"-"` // exposed via the access-controlled email resolver
	// RevealEmail is set when the value is returned to its own (just
	// authenticated) owner, e.g. in an AuthPayload, before a token is attached.
	RevealEmail bool      `json:"-"`
	DisplayName string    `json:"displayName"`
	Role        UserRole  `json:"role"`
	CreatedAt   time.Time `json:"createdAt"`
	// SuspendedAt is exposed through the access-controlled suspended resolver.
	SuspendedAt *time.Time `json:"-"`
}

type Shop struct {
	ID          string    `json:"id"`
	OwnerID     string    `json:"-"`
	Slug        string    `json:"slug"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	LogoURL     *string   `json:"logoUrl,omitempty"`
	BannerURL   *string   `json:"bannerUrl,omitempty"`
	City        string    `json:"city"`
	Lat         *float64  `json:"lat,omitempty"`
	Lng         *float64  `json:"lng,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
	// SuspendedAt is exposed through the access-controlled suspended resolver.
	SuspendedAt *time.Time `json:"-"`
}

type Coffee struct {
	ID                 string      `json:"id"`
	ShopID             string      `json:"-"`
	Name               string      `json:"name"`
	Slug               string      `json:"slug"`
	Description        string      `json:"description"`
	OriginCountryID    string      `json:"-"`
	VarietyID          *string     `json:"-"`
	ProcessingMethodID string      `json:"-"`
	RoastLevel         *RoastLevel `json:"roastLevel,omitempty"`
	FlavorNotes        []string    `json:"flavorNotes"`
	Producer           string      `json:"producer"`
	Region             string      `json:"region"`
	AltitudeMinM       *int        `json:"altitudeMinM,omitempty"`
	AltitudeMaxM       *int        `json:"altitudeMaxM,omitempty"`
	BrewMethod         *BrewMethod `json:"brewMethod,omitempty"`
	HarvestYear        *int        `json:"harvestYear,omitempty"`
	ImageUrls          []string    `json:"imageUrls"`
	IsPublished        bool        `json:"isPublished"`
	CreatedAt          time.Time   `json:"createdAt"`
	UpdatedAt          time.Time   `json:"updatedAt"`
}

type Comment struct {
	ID        string     `json:"id"`
	UserID    string     `json:"-"`
	CoffeeID  string     `json:"-"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"createdAt"`
	EditedAt  *time.Time `json:"editedAt,omitempty"`
	FromShop  bool       `json:"fromShop"`
}

// Report is one visitor report (#225); reporter, handledBy and the target
// objects resolve from the IDs.
type Report struct {
	ID          string           `json:"id"`
	ReporterID  *string          `json:"-"`
	TargetType  ReportTargetType `json:"targetType"`
	TargetID    string           `json:"targetId"`
	Reason      ReportReason     `json:"reason"`
	Note        string           `json:"note"`
	Status      ReportStatus     `json:"status"`
	HandledByID *string          `json:"-"`
	HandledAt   *time.Time       `json:"handledAt,omitempty"`
	CreatedAt   time.Time        `json:"createdAt"`
}

// AuditEntry is one audit-log row (#224); actor resolves from ActorID.
type AuditEntry struct {
	ID         string          `json:"id"`
	ActorID    *string         `json:"-"`
	Action     AuditAction     `json:"action"`
	TargetType AuditTargetType `json:"targetType"`
	TargetID   string          `json:"targetId"`
	Reason     string          `json:"reason"`
	CreatedAt  time.Time       `json:"createdAt"`
}

// Cart is the signed-in buyer's cart (#21).
type Cart struct {
	Items       []*CartItem `json:"items"`
	SubtotalTwd money.TWD   `json:"subtotalTwd"`
	ItemCount   int         `json:"itemCount"`
}

// CartItem is one cart line; coffee resolves from CoffeeID with the usual
// visibility check.
type CartItem struct {
	ID            string    `json:"id"`
	Quantity      int       `json:"quantity"`
	Variant       *Variant  `json:"variant"`
	CoffeeID      string    `json:"-"`
	AddedPriceTwd money.TWD `json:"addedPriceTwd"`
	PriceTwd      money.TWD `json:"priceTwd"`
	PriceChanged  bool      `json:"priceChanged"`
	Available     bool      `json:"available"`
	LineTotalTwd  money.TWD `json:"lineTotalTwd"`
}
