package model

import "time"

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
}

type Coffee struct {
	ID                 string     `json:"id"`
	ShopID             string     `json:"-"`
	Name               string     `json:"name"`
	Slug               string     `json:"slug"`
	Description        string     `json:"description"`
	OriginCountryID    string     `json:"-"`
	VarietyID          *string    `json:"-"`
	ProcessingMethodID string     `json:"-"`
	RoastLevel         RoastLevel `json:"roastLevel"`
	FlavorNotes        []string   `json:"flavorNotes"`
	ImageUrls          []string   `json:"imageUrls"`
	IsPublished        bool       `json:"isPublished"`
	CreatedAt          time.Time  `json:"createdAt"`
}

type Comment struct {
	ID        string    `json:"id"`
	UserID    string    `json:"-"`
	CoffeeID  string    `json:"-"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}
