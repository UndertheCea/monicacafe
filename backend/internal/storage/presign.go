// Package storage presigns uploads to an S3-compatible object store (MinIO in
// development; R2 / S3 / GCS interop in production — see question #7) and
// decides which image URLs belong to it.
//
// The presigner is a small hand-written AWS Signature V4 implementation
// (query-string auth) so the backend needs no AWS SDK. It is checked against
// AWS's published example in presign_test.go.
package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	sigAlgorithm   = "AWS4-HMAC-SHA256"
	unsignedBody   = "UNSIGNED-PAYLOAD"
	amzDateFormat  = "20060102T150405Z"
	amzShortFormat = "20060102"
)

// presignRequest describes one request to sign. Host is taken from URL.
type presignRequest struct {
	Method    string
	URL       *url.URL // scheme://host/path; any existing query is ignored
	Headers   map[string]string
	Region    string
	AccessKey string
	SecretKey string
	Time      time.Time
	Expires   time.Duration
}

// presign returns the URL with SigV4 query authentication. Every header in
// req.Headers (plus host) is signed, so the client must send exactly those
// values — that is how the content type and size of an upload are enforced.
func presign(req presignRequest) string {
	t := req.Time.UTC()
	amzDate := t.Format(amzDateFormat)
	scope := fmt.Sprintf("%s/%s/s3/aws4_request", t.Format(amzShortFormat), req.Region)

	headers := map[string]string{"host": req.URL.Host}
	for k, v := range req.Headers {
		headers[strings.ToLower(k)] = strings.TrimSpace(v)
	}
	names := make([]string, 0, len(headers))
	for k := range headers {
		names = append(names, k)
	}
	sort.Strings(names)
	var canonHeaders strings.Builder
	for _, k := range names {
		canonHeaders.WriteString(k + ":" + headers[k] + "\n")
	}
	signedHeaders := strings.Join(names, ";")

	q := url.Values{}
	q.Set("X-Amz-Algorithm", sigAlgorithm)
	q.Set("X-Amz-Credential", req.AccessKey+"/"+scope)
	q.Set("X-Amz-Date", amzDate)
	q.Set("X-Amz-Expires", fmt.Sprintf("%d", int(req.Expires.Seconds())))
	q.Set("X-Amz-SignedHeaders", signedHeaders)
	canonQuery := canonicalQuery(q)

	path := uriEncode(req.URL.Path, false)
	if path == "" {
		path = "/"
	}
	canonReq := strings.Join([]string{
		req.Method, path, canonQuery, canonHeaders.String(), signedHeaders, unsignedBody,
	}, "\n")

	sum := sha256.Sum256([]byte(canonReq))
	toSign := strings.Join([]string{sigAlgorithm, amzDate, scope, hex.EncodeToString(sum[:])}, "\n")

	key := hmacSHA256([]byte("AWS4"+req.SecretKey), t.Format(amzShortFormat))
	key = hmacSHA256(key, req.Region)
	key = hmacSHA256(key, "s3")
	key = hmacSHA256(key, "aws4_request")
	sig := hex.EncodeToString(hmacSHA256(key, toSign))

	u := *req.URL
	u.RawQuery = canonQuery + "&X-Amz-Signature=" + sig
	u.Fragment = ""
	return u.String()
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

// canonicalQuery sorts parameters by key and encodes them per SigV4.
func canonicalQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		for _, v := range q[k] {
			parts = append(parts, uriEncode(k, true)+"="+uriEncode(v, true))
		}
	}
	return strings.Join(parts, "&")
}

// uriEncode percent-encodes everything except unreserved characters (and '/'
// unless encodeSlash), as SigV4 requires.
func uriEncode(s string, encodeSlash bool) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		case c == '/' && !encodeSlash:
			b.WriteByte(c)
		default:
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}
