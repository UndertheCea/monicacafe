package storage

import (
	"errors"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestImageExt(t *testing.T) {
	tests := []struct {
		ct      string
		size    int64
		want    string
		wantErr error
	}{
		{"image/jpeg", 1, "jpg", nil},
		{" IMAGE/PNG ", 1024, "png", nil},
		{"image/webp", MaxImageBytes, "webp", nil},
		{"image/webp", MaxImageBytes + 1, "", ErrSize},
		{"image/jpeg", 0, "", ErrSize},
		{"image/jpeg", -5, "", ErrSize},
		{"image/gif", 10, "", ErrContentType},
		{"image/svg+xml", 10, "", ErrContentType},
		{"text/html", 10, "", ErrContentType},
		{"", 10, "", ErrContentType},
	}
	for _, tt := range tests {
		got, err := ImageExt(tt.ct, tt.size)
		if got != tt.want || !errors.Is(err, tt.wantErr) {
			t.Errorf("ImageExt(%q, %d) = %q, %v; want %q, %v", tt.ct, tt.size, got, err, tt.want, tt.wantErr)
		}
	}
}

func TestNew(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		nilOK   bool // nil Media, nil error
		wantErr bool
		public  string
	}{
		{name: "disabled", cfg: Config{}, nilOK: true},
		{name: "half keys", cfg: Config{AccessKey: "a", Endpoint: "http://localhost", Bucket: "media"}, wantErr: true},
		{name: "bad endpoint", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "localhost", Bucket: "media"}, wantErr: true},
		{name: "endpoint with path", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost/x", Bucket: "media"}, wantErr: true},
		{name: "no bucket", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost"}, wantErr: true},
		{name: "default port dropped", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost:80", Bucket: "media"}, public: "http://localhost/media"},
		{name: "custom port kept", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost:8080", Bucket: "media"}, public: "http://localhost:8080/media"},
		{name: "default public", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost/", Bucket: "media"}, public: "http://localhost/media"},
		{name: "cdn public", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "https://s3.example.com", Bucket: "media", PublicURL: "https://cdn.example.com/m/"}, public: "https://cdn.example.com/m"},
		{name: "bad public", cfg: Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost", Bucket: "media", PublicURL: "ftp://x"}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, err := New(tt.cfg)
			if tt.wantErr {
				if err == nil {
					t.Fatal("want error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tt.nilOK {
				if m != nil {
					t.Fatal("want nil Media")
				}
				return
			}
			if m.publicURL != tt.public {
				t.Fatalf("public = %q, want %q", m.publicURL, tt.public)
			}
		})
	}
}

func testMedia(t *testing.T) *Media {
	t.Helper()
	m, err := New(Config{Endpoint: "http://localhost", Bucket: "media", AccessKey: "ak", SecretKey: "sk"})
	if err != nil {
		t.Fatal(err)
	}
	m.now = func() time.Time { return time.Date(2026, 11, 5, 8, 0, 0, 0, time.UTC) }
	return m
}

func TestPresignPut(t *testing.T) {
	m := testMedia(t)
	up := m.PresignPut("shops/abc/logo-1.png", "image/png", 1234)
	u, err := url.Parse(up.UploadURL)
	if err != nil {
		t.Fatal(err)
	}
	if u.Host != "localhost" || u.Path != "/media/shops/abc/logo-1.png" {
		t.Fatalf("upload URL = %s", up.UploadURL)
	}
	q := u.Query()
	if q.Get("X-Amz-Expires") != "600" || q.Get("X-Amz-SignedHeaders") != "content-length;content-type;host" || q.Get("X-Amz-Signature") == "" {
		t.Fatalf("query = %v", q)
	}
	if up.PublicURL != "http://localhost/media/shops/abc/logo-1.png" || up.Headers["Content-Type"] != "image/png" {
		t.Fatalf("upload = %+v", up)
	}
	if !up.ExpiresAt.Equal(m.now().Add(UploadTTL)) {
		t.Fatalf("expiresAt = %v", up.ExpiresAt)
	}
}

func TestKeyOf(t *testing.T) {
	m := testMedia(t)
	tests := []struct{ in, want string }{
		{"http://localhost/media/shops/a/logo-1.jpg", "shops/a/logo-1.jpg"},
		{"http://localhost/media/", ""},
		{"http://localhost/media", ""},
		{"http://localhost/mediax/shops/a.jpg", ""},
		{"https://localhost/media/shops/a.jpg", ""},
		{"http://evil.example/media/shops/a.jpg", ""},
		{"http://localhost/media/shops/../coffees/b.jpg", ""},
		{"http://localhost/media/shops/a.jpg?x=1", ""},
		{"http://localhost/media/shops//a.jpg", ""},
		{"http://localhost/media/shops/%2e%2e/a.jpg", ""},
	}
	for _, tt := range tests {
		if got := m.KeyOf(tt.in); got != tt.want {
			t.Errorf("KeyOf(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNewKey(t *testing.T) {
	k1, err := NewKey(ShopPrefix("s1"), "logo", "png")
	if err != nil {
		t.Fatal(err)
	}
	k2, _ := NewKey(ShopPrefix("s1"), "logo", "png")
	if !strings.HasPrefix(k1, "shops/s1/logo-") || !strings.HasSuffix(k1, ".png") || k1 == k2 {
		t.Fatalf("keys %q %q", k1, k2)
	}
	if c := CoffeePrefix("c1"); c != "coffees/c1/" {
		t.Fatal(c)
	}
}
