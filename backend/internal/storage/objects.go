package storage

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Object is one entry of a bucket listing.
type Object struct {
	Key          string
	LastModified time.Time
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

// signedURL presigns method on key ("" for the bucket itself) against the
// internal endpoint, valid for a minute.
func (m *Media) signedURL(method, key string, query url.Values) string {
	u := *m.internal
	u.Path = "/" + m.bucket
	if key != "" {
		u.Path += "/" + key
	}
	return presign(presignRequest{
		Method: method, URL: &u, Query: query, Region: m.region,
		AccessKey: m.accessKey, SecretKey: m.secretKey, Time: m.now(), Expires: time.Minute,
	})
}

type listResult struct {
	Contents []struct {
		Key          string `xml:"Key"`
		LastModified string `xml:"LastModified"`
	} `xml:"Contents"`
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
}

// ListObjects returns one page (up to 1000 keys) of objects under prefix
// (S3 ListObjectsV2) and the token for the next page, "" on the last one.
func (m *Media) ListObjects(ctx context.Context, prefix, continuation string) ([]Object, string, error) {
	q := url.Values{"list-type": {"2"}, "prefix": {prefix}}
	if continuation != "" {
		q.Set("continuation-token", continuation)
	}
	body, err := m.do(ctx, http.MethodGet, "", q, http.StatusOK)
	if err != nil {
		return nil, "", err
	}
	return parseListObjects(body)
}

func parseListObjects(body []byte) ([]Object, string, error) {
	var r listResult
	if err := xml.Unmarshal(body, &r); err != nil {
		return nil, "", fmt.Errorf("storage: parse listing: %w", err)
	}
	out := make([]Object, 0, len(r.Contents))
	for _, c := range r.Contents {
		t, err := time.Parse(time.RFC3339, c.LastModified)
		if err != nil {
			return nil, "", fmt.Errorf("storage: bad LastModified %q for %s", c.LastModified, c.Key)
		}
		out = append(out, Object{Key: c.Key, LastModified: t})
	}
	next := ""
	if r.IsTruncated {
		next = r.NextContinuationToken
		if next == "" {
			return nil, "", fmt.Errorf("storage: truncated listing without a continuation token")
		}
	}
	return out, next, nil
}

// Ping reports whether the bucket answers a one-key listing (readiness check).
func (m *Media) Ping(ctx context.Context) error {
	_, err := m.do(ctx, http.MethodGet, "", url.Values{"list-type": {"2"}, "max-keys": {"1"}}, http.StatusOK)
	return err
}

// DeleteObject removes key from the bucket. Deleting a missing key succeeds.
func (m *Media) DeleteObject(ctx context.Context, key string) error {
	_, err := m.do(ctx, http.MethodDelete, key, nil, http.StatusNoContent, http.StatusOK)
	return err
}

func (m *Media) do(ctx context.Context, method, key string, q url.Values, ok ...int) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, m.signedURL(method, key, q), nil)
	if err != nil {
		return nil, err
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("storage: %s %s: %w", method, key, err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if err != nil {
		return nil, err
	}
	for _, code := range ok {
		if res.StatusCode == code {
			return body, nil
		}
	}
	snippet := body
	if len(snippet) > 300 {
		snippet = snippet[:300]
	}
	return nil, fmt.Errorf("storage: %s %q: HTTP %d: %s", method, key, res.StatusCode, snippet)
}

// keyRe matches the object keys NewKey creates under ShopPrefix / CoffeePrefix.
var keyRe = regexp.MustCompile(`(?:shops|coffees)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]+-[0-9a-f]{24}\.(?:jpg|png|webp)$`)

// thumbKeyRe matches the thumbnail key ThumbKey derives from an original key;
// group 1 is the original's key without its extension.
var thumbKeyRe = regexp.MustCompile(`^((?:shops|coffees)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]+-[0-9a-f]{24})\.thumb\.webp$`)

// ThumbKey is the key of the 640 px thumbnail stored next to an original
// ("…/photo-<hex>.jpg" becomes "…/photo-<hex>.thumb.webp"), or "" when key
// isn't an original's key. Thumbnails are derived, never saved to the
// database (#235).
func ThumbKey(key string) string {
	if keyRe.FindString(key) != key {
		return ""
	}
	return key[:strings.LastIndex(key, ".")] + ".thumb.webp"
}

// IsThumbKey reports whether key has the shape ThumbKey produces.
func IsThumbKey(key string) bool { return thumbKeyRe.MatchString(key) }

// ReferenceKey maps an object key to what the database can reference: a
// thumbnail is referenced iff its original is, so it is looked up as the
// original's stem (the reference query matches by substring, so "…/photo-<hex>"
// finds the saved "….jpg" URL). Other keys map to themselves.
func ReferenceKey(key string) string {
	if m := thumbKeyRe.FindStringSubmatch(key); m != nil {
		return m[1]
	}
	return key
}

// ImageKeyIn extracts the object key from a saved image URL by its shape
// (not by MEDIA_PUBLIC_URL), so changing the public URL — e.g. putting a CDN
// in front — never makes stored images look unreferenced. "" if none.
func ImageKeyIn(rawURL string) string {
	if u, err := url.Parse(rawURL); err == nil {
		rawURL = u.Path
	}
	return keyRe.FindString(rawURL)
}

// Orphans returns the keys among objects that no saved URL references and
// that are older than minAge (so uploads still being saved aren't touched).
// Only keys shaped like NewKey's output are ever returned.
func Orphans(objects []Object, referenced map[string]bool, now time.Time, minAge time.Duration) []string {
	var out []string
	for _, o := range objects {
		if referenced[o.Key] || now.Sub(o.LastModified) < minAge {
			continue
		}
		if keyRe.FindString(o.Key) != o.Key && !IsThumbKey(o.Key) {
			continue // not ours (or a different layout): leave it alone
		}
		out = append(out, o.Key)
	}
	return out
}
