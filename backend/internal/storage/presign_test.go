package storage

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

// AWS's published example for query-string auth ("Example: Presigned URL",
// Amazon S3 API reference, Authenticating Requests: Using Query Parameters).
func TestPresignAWSExample(t *testing.T) {
	u, _ := url.Parse("https://examplebucket.s3.amazonaws.com/test.txt")
	got := presign(presignRequest{
		Method:    "GET",
		URL:       u,
		Region:    "us-east-1",
		AccessKey: "AKIAIOSFODNN7EXAMPLE",
		SecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		Time:      time.Date(2013, 5, 24, 0, 0, 0, 0, time.UTC),
		Expires:   86400 * time.Second,
	})
	want := "https://examplebucket.s3.amazonaws.com/test.txt" +
		"?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
		"&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
		"&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
		"&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"
	if got != want {
		t.Fatalf("presign mismatch\n got: %s\nwant: %s", got, want)
	}
}

func TestURIEncode(t *testing.T) {
	tests := []struct {
		in          string
		encodeSlash bool
		want        string
	}{
		{"/media/shops/a-b_c.~x.jpg", false, "/media/shops/a-b_c.~x.jpg"},
		{"a/b", true, "a%2Fb"},
		{"a b+c=d", true, "a%20b%2Bc%3Dd"},
		{"咖啡", false, "%E5%92%96%E5%95%A1"},
	}
	for _, tt := range tests {
		if got := uriEncode(tt.in, tt.encodeSlash); got != tt.want {
			t.Errorf("uriEncode(%q, %v) = %q, want %q", tt.in, tt.encodeSlash, got, tt.want)
		}
	}
}

func TestPresignSignsExtraHeaders(t *testing.T) {
	u, _ := url.Parse("http://localhost/media/k.jpg")
	base := presignRequest{
		Method: "PUT", URL: u, Region: "us-east-1", AccessKey: "ak", SecretKey: "sk",
		Time: time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC), Expires: time.Minute,
		Headers: map[string]string{"Content-Type": "image/png", "Content-Length": "10"},
	}
	a := presign(base)
	if !strings.Contains(a, "X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost") {
		t.Fatalf("headers not signed: %s", a)
	}
	other := base
	other.Headers = map[string]string{"Content-Type": "image/png", "Content-Length": "11"}
	if presign(other) == a {
		t.Fatal("changing a signed header must change the signature")
	}
}
