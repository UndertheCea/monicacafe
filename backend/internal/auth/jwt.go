// Package auth issues and verifies JWTs and hashes passwords.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// AccessTTL is the lifetime of an access token.
	AccessTTL = 15 * time.Minute
	// RefreshTTL is the lifetime of a refresh token.
	RefreshTTL = 7 * 24 * time.Hour

	issuer = "monicacafe-api"
)

// Claims are the JWT claims used by both token kinds. Access tokens carry the
// user's role; refresh tokens carry a unique JTI (RegisteredClaims.ID) that is
// tracked server-side so it can be rotated and revoked.
type Claims struct {
	UserID string `json:"user_id"`
	Role   string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

// RefreshToken is a freshly issued refresh token.
type RefreshToken struct {
	Token     string
	JTIHash   string // SHA-256 of the JTI, for server-side storage
	ExpiresAt time.Time
}

// Service signs and verifies tokens.
type Service struct {
	accessSecret  []byte
	refreshSecret []byte
	now           func() time.Time
}

// NewService builds a Service using separate HMAC secrets for each token kind.
func NewService(accessSecret, refreshSecret string) *Service {
	return &Service{
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		now:           time.Now,
	}
}

// IssueAccessToken signs a short-lived access token.
func (s *Service) IssueAccessToken(userID, role string) (string, error) {
	now := s.now()
	claims := Claims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(now.Add(AccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.accessSecret)
}

// IssueRefreshToken signs a long-lived refresh token with a random JTI.
func (s *Service) IssueRefreshToken(userID string) (*RefreshToken, error) {
	jti, err := randomID()
	if err != nil {
		return nil, err
	}
	now := s.now()
	exp := now.Add(RefreshTTL)
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   userID,
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.refreshSecret)
	if err != nil {
		return nil, err
	}
	return &RefreshToken{Token: tok, JTIHash: HashJTI(jti), ExpiresAt: exp}, nil
}

// ParseAccessToken verifies an access token.
func (s *Service) ParseAccessToken(tokenStr string) (*Claims, error) {
	return s.parse(tokenStr, s.accessSecret)
}

// ParseRefreshToken verifies a refresh token and ensures it carries a JTI.
func (s *Service) ParseRefreshToken(tokenStr string) (*Claims, error) {
	c, err := s.parse(tokenStr, s.refreshSecret)
	if err != nil {
		return nil, err
	}
	if c.ID == "" {
		return nil, errors.New("refresh token missing jti")
	}
	return c, nil
}

func (s *Service) parse(tokenStr string, secret []byte) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (any, error) {
		return secret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(s.now),
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid || claims.UserID == "" {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// HashJTI returns the hex SHA-256 of a refresh-token JTI.
func HashJTI(jti string) string {
	sum := sha256.Sum256([]byte(jti))
	return hex.EncodeToString(sum[:])
}

func randomID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
