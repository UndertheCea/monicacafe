package storage

import (
	"strings"
	"testing"
	"time"
)

const (
	shopKey   = "shops/0b6f9a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b/logo-0123456789abcdef01234567.jpg"
	coffeeKey = "coffees/1c7a0b6f-4d2e-4f30-8b9c-8d7e6f5a4b3c/photo-89abcdef0123456789abcdef.webp"
)

func TestImageKeyIn(t *testing.T) {
	cases := []struct{ in, want string }{
		{"http://localhost/media/" + shopKey, shopKey},
		{"https://cdn.monicafe.tw/" + coffeeKey, coffeeKey},
		{"https://cdn.monicafe.tw/" + coffeeKey + "?v=2", coffeeKey},
		{shopKey, shopKey},
		{"http://localhost/media/shops/not-a-uuid/logo-0123456789abcdef01234567.jpg", ""},
		{"http://localhost/media/" + shopKey + ".gif", ""},
		{"https://example.com/elsewhere.jpg", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := ImageKeyIn(c.in); got != c.want {
			t.Errorf("ImageKeyIn(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestOrphans(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	old, fresh := now.Add(-48*time.Hour), now.Add(-time.Hour)
	other := "coffees/1c7a0b6f-4d2e-4f30-8b9c-8d7e6f5a4b3c/photo-000000000000000000000000.png"
	cases := []struct {
		name       string
		objects    []Object
		referenced map[string]bool
		want       []string
	}{
		{"old and unreferenced → orphan", []Object{{shopKey, old}}, nil, []string{shopKey}},
		{"referenced is kept", []Object{{shopKey, old}}, map[string]bool{shopKey: true}, nil},
		{"young upload is kept", []Object{{shopKey, fresh}}, nil, nil},
		{"exactly min age → orphan", []Object{{shopKey, now.Add(-24 * time.Hour)}}, nil, []string{shopKey}},
		{"foreign key shape is never touched", []Object{{"shops/readme.txt", old}, {"coffees/x/y.jpg", old}}, nil, nil},
		{"mixed", []Object{{shopKey, old}, {coffeeKey, old}, {other, fresh}}, map[string]bool{coffeeKey: true}, []string{shopKey}},
	}
	for _, c := range cases {
		got := Orphans(c.objects, c.referenced, now, 24*time.Hour)
		if len(got) != len(c.want) {
			t.Errorf("%s: Orphans = %v, want %v", c.name, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%s: Orphans = %v, want %v", c.name, got, c.want)
			}
		}
	}
}

func TestParseListObjects(t *testing.T) {
	page := `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>media</Name><Prefix>shops/</Prefix><KeyCount>2</KeyCount>
  <IsTruncated>true</IsTruncated><NextContinuationToken>tok-2</NextContinuationToken>
  <Contents><Key>` + shopKey + `</Key><LastModified>2026-11-05T10:00:00.000Z</LastModified><Size>3</Size></Contents>
  <Contents><Key>shops/b</Key><LastModified>2026-11-04T10:00:00Z</LastModified></Contents>
</ListBucketResult>`
	objs, next, err := parseListObjects([]byte(page))
	if err != nil || next != "tok-2" || len(objs) != 2 || objs[0].Key != shopKey ||
		!objs[0].LastModified.Equal(time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("parse = %+v, %q, %v", objs, next, err)
	}

	cases := []struct {
		name, body string
		wantErr    bool
	}{
		{"last page", `<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>`, false},
		{"truncated without token", `<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>`, true},
		{"bad time", `<ListBucketResult><Contents><Key>k</Key><LastModified>yesterday</LastModified></Contents></ListBucketResult>`, true},
		{"not xml", `<html>502</html`, true},
	}
	for _, c := range cases {
		_, next, err := parseListObjects([]byte(c.body))
		if (err != nil) != c.wantErr || (err == nil && next != "") {
			t.Errorf("%s: next %q, err %v", c.name, next, err)
		}
	}
}

func TestSignedURLUsesInternalEndpoint(t *testing.T) {
	m, err := New(Config{AccessKey: "a", SecretKey: "s", Endpoint: "http://localhost", Bucket: "media", InternalEndpoint: "http://seaweedfs:8333"})
	if err != nil {
		t.Fatal(err)
	}
	got := m.signedURL("GET", "", map[string][]string{"list-type": {"2"}, "prefix": {"shops/"}})
	for _, want := range []string{"http://seaweedfs:8333/media?", "list-type=2", "prefix=shops%2F", "X-Amz-Signature="} {
		if !strings.Contains(got, want) {
			t.Errorf("signed URL %q lacks %q", got, want)
		}
	}
	// Uploads are still signed for the browser-facing endpoint.
	if up := m.PresignPut("shops/x/logo-1.png", "image/png", 10); !strings.HasPrefix(up.UploadURL, "http://localhost/media/") {
		t.Errorf("upload URL %q", up.UploadURL)
	}
}
