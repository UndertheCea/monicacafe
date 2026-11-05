package storage

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// Image upload limits.
const (
	MaxImageBytes = 5 << 20 // 5 MiB
	UploadTTL     = 10 * time.Minute
)

// imageTypes maps the accepted content types to file extensions.
var imageTypes = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

var (
	ErrContentType = errors.New("content type must be image/jpeg, image/png or image/webp")
	ErrSize        = fmt.Errorf("image must be 1 byte to %d MB", MaxImageBytes>>20)
)

// ImageExt validates an upload's declared type and size and returns the file
// extension to use for its object key.
func ImageExt(contentType string, size int64) (string, error) {
	ext, ok := imageTypes[strings.ToLower(strings.TrimSpace(contentType))]
	if !ok {
		return "", ErrContentType
	}
	if size <= 0 || size > MaxImageBytes {
		return "", ErrSize
	}
	return ext, nil
}

// Config holds the object-store settings (from config.Load()).
type Config struct {
	// Endpoint is the store's base URL *as the browser sees it*: presigned URLs
	// are signed for this host, so it must be the host the browser PUTs to.
	// In compose that is nginx (http://localhost), which proxies /<bucket>/ to the store.
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	// PublicURL is the base URL objects are served from; defaults to Endpoint/Bucket.
	PublicURL string
	// InternalEndpoint is where the API itself reaches the store (listing and
	// deleting objects), e.g. http://seaweedfs:8333 in compose, where the
	// browser-facing Endpoint (nginx on localhost) isn't reachable. Defaults to
	// Endpoint.
	InternalEndpoint string
}

// Media presigns uploads and recognises URLs of objects in the bucket.
type Media struct {
	endpoint  *url.URL
	bucket    string
	region    string
	accessKey string
	secretKey string
	publicURL string // no trailing slash
	internal  *url.URL
	now       func() time.Time
}

// New returns nil (uploads disabled) when no access key is configured.
func New(c Config) (*Media, error) {
	if c.AccessKey == "" && c.SecretKey == "" {
		return nil, nil
	}
	if c.AccessKey == "" || c.SecretKey == "" {
		return nil, errors.New("storage: S3_ACCESS_KEY and S3_SECRET_KEY must both be set")
	}
	u, err := url.Parse(strings.TrimRight(c.Endpoint, "/"))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || (u.Path != "" && u.Path != "/") {
		return nil, fmt.Errorf("storage: S3_ENDPOINT must be an http(s) origin, got %q", c.Endpoint)
	}
	u.Path = ""
	// Browsers omit the default port from the Host header, and the signature
	// covers Host, so http://localhost:80 must be signed as "localhost".
	if (u.Scheme == "http" && u.Port() == "80") || (u.Scheme == "https" && u.Port() == "443") {
		u.Host = u.Hostname()
	}
	if c.Bucket == "" || strings.Contains(c.Bucket, "/") {
		return nil, errors.New("storage: S3_BUCKET must be a bucket name")
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}
	pub := strings.TrimRight(c.PublicURL, "/")
	if pub == "" {
		pub = u.String() + "/" + c.Bucket
	}
	if p, err := url.Parse(pub); err != nil || (p.Scheme != "http" && p.Scheme != "https") || p.Host == "" {
		return nil, fmt.Errorf("storage: MEDIA_PUBLIC_URL must be an http(s) URL, got %q", c.PublicURL)
	}
	internal := u
	if c.InternalEndpoint != "" {
		iu, err := url.Parse(strings.TrimRight(c.InternalEndpoint, "/"))
		if err != nil || (iu.Scheme != "http" && iu.Scheme != "https") || iu.Host == "" || (iu.Path != "" && iu.Path != "/") {
			return nil, fmt.Errorf("storage: S3_INTERNAL_ENDPOINT must be an http(s) origin, got %q", c.InternalEndpoint)
		}
		iu.Path = ""
		internal = iu
	}
	return &Media{
		endpoint: u, bucket: c.Bucket, region: region,
		accessKey: c.AccessKey, secretKey: c.SecretKey, publicURL: pub, internal: internal, now: time.Now,
	}, nil
}

// Upload is a presigned PUT plus the URL the object will be served from.
type Upload struct {
	UploadURL string
	PublicURL string
	// Headers the client must send with the PUT (they are part of the signature).
	Headers   map[string]string
	ExpiresAt time.Time
}

// PresignPut signs a PUT of exactly size bytes of contentType to key.
func (m *Media) PresignPut(key, contentType string, size int64) Upload {
	now := m.now()
	u := *m.endpoint
	u.Path = "/" + m.bucket + "/" + key
	headers := map[string]string{
		"Content-Type":   contentType,
		"Content-Length": fmt.Sprintf("%d", size),
	}
	signed := presign(presignRequest{
		Method: "PUT", URL: &u, Headers: headers, Region: m.region,
		AccessKey: m.accessKey, SecretKey: m.secretKey, Time: now, Expires: UploadTTL,
	})
	return Upload{
		UploadURL: signed,
		PublicURL: m.PublicURLFor(key),
		Headers:   map[string]string{"Content-Type": contentType},
		ExpiresAt: now.Add(UploadTTL),
	}
}

// PublicURLFor is the URL an object key is served from.
func (m *Media) PublicURLFor(key string) string { return m.publicURL + "/" + key }

// KeyOf returns the object key of a URL served from this bucket, or "" when
// the URL points anywhere else (another host, a path escape, a query string).
func (m *Media) KeyOf(raw string) string {
	prefix := m.publicURL + "/"
	if !strings.HasPrefix(raw, prefix) {
		return ""
	}
	key := strings.TrimPrefix(raw, prefix)
	if key == "" || strings.ContainsAny(key, "?#\\%") || strings.Contains(key, "..") || strings.Contains(key, "//") {
		return ""
	}
	return key
}

// Object-key prefixes. Keys are random per upload, so a replaced image never
// collides with a cached old one.
func ShopPrefix(shopID string) string     { return "shops/" + shopID + "/" }
func CoffeePrefix(coffeeID string) string { return "coffees/" + coffeeID + "/" }

// NewKey builds "<prefix><kind>-<random>.<ext>".
func NewKey(prefix, kind, ext string) (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return prefix + kind + "-" + hex.EncodeToString(b) + "." + ext, nil
}
