package graph_test

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/storage"
)

// testMedia configures uploads for the integration server. With
// TEST_S3_ENDPOINT (+ TEST_S3_ACCESS_KEY / TEST_S3_SECRET_KEY / TEST_S3_BUCKET)
// set, it targets a real S3-compatible store and TestImageUploads also PUTs a
// file; otherwise it signs for a fake host and only the API is exercised.
func testMedia(t *testing.T) *storage.Media {
	t.Helper()
	cfg := storage.Config{Endpoint: "http://media.test", Bucket: "media", AccessKey: "test-ak", SecretKey: "test-sk"}
	if ep := os.Getenv("TEST_S3_ENDPOINT"); ep != "" {
		cfg = storage.Config{
			Endpoint: ep, Bucket: os.Getenv("TEST_S3_BUCKET"),
			AccessKey: os.Getenv("TEST_S3_ACCESS_KEY"), SecretKey: os.Getenv("TEST_S3_SECRET_KEY"),
		}
	}
	m, err := storage.New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

// TestImageUploads covers createImageUpload and the image-URL rules on
// updateShop / updateCoffee. Requires TEST_DATABASE_URL.
func TestImageUploads(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "useller+"+run+"@example.com")
	other, _ := register(t, url, "uother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "uploads-" + run, "name": "上傳測試", "description": "", "city": "台南市"}}, &shop)
	shopID := shop.CreateShop.ID

	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var co struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": map[string]any{
			"name": "Upload Test", "description": "", "roastLevel": "LIGHT", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 1}},
		}}, &co)
	coffeeID := co.CreateCoffee.ID

	const uploadQ = `mutation($in: ImageUploadInput!) { createImageUpload(input: $in) { uploadUrl publicUrl headers { name value } expiresAt } }`
	in := func(kind, target, ct string, size int) map[string]any {
		return map[string]any{"in": map[string]any{"kind": kind, "targetId": target, "contentType": ct, "byteSize": size}}
	}

	// ── Validation & authorisation ──────────────────────────────────────────
	anon.expectCode(graph.CodeUnauthenticated, uploadQ, in("SHOP_LOGO", shopID, "image/png", 100))
	other.expectCode(graph.CodeForbidden, uploadQ, in("SHOP_LOGO", shopID, "image/png", 100))
	other.expectCode(graph.CodeForbidden, uploadQ, in("COFFEE_PHOTO", coffeeID, "image/png", 100))
	seller.expectCode(graph.CodeNotFound, uploadQ, in("COFFEE_PHOTO", shopID, "image/png", 100))
	seller.expectCode(graph.CodeBadInput, uploadQ, in("SHOP_LOGO", shopID, "image/gif", 100))
	seller.expectCode(graph.CodeBadInput, uploadQ, in("SHOP_LOGO", shopID, "image/svg+xml", 100))
	seller.expectCode(graph.CodeBadInput, uploadQ, in("SHOP_LOGO", shopID, "image/png", storage.MaxImageBytes+1))
	seller.expectCode(graph.CodeBadInput, uploadQ, in("SHOP_LOGO", shopID, "image/png", 0))

	type upload struct {
		UploadURL, PublicURL string
		Headers              []struct{ Name, Value string }
	}
	var logo struct{ CreateImageUpload upload }
	img := []byte("\x89PNG\r\n\x1a\nnot-really-a-png-" + run)
	seller.mustDo(uploadQ, in("SHOP_LOGO", shopID, "image/png", len(img)), &logo)
	lu := logo.CreateImageUpload
	if !strings.Contains(lu.PublicURL, "/shops/"+shopID+"/logo-") || !strings.HasSuffix(lu.PublicURL, ".png") ||
		!strings.Contains(lu.UploadURL, "X-Amz-Signature=") || len(lu.Headers) != 1 || lu.Headers[0].Value != "image/png" {
		t.Fatalf("unexpected upload: %+v", lu)
	}

	// Optional: a real PUT + public GET when an S3-compatible store is configured.
	if os.Getenv("TEST_S3_ENDPOINT") != "" {
		put := func(body []byte) int {
			req, _ := http.NewRequest(http.MethodPut, lu.UploadURL, bytes.NewReader(body))
			req.Header.Set("Content-Type", "image/png")
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			res.Body.Close()
			return res.StatusCode
		}
		if code := put(append(img, 'x')); code < 400 {
			t.Fatalf("PUT with a different size than signed must fail, got %d", code)
		}
		if code := put(img); code != http.StatusOK {
			t.Fatalf("PUT = %d", code)
		}
		res, err := http.Get(lu.PublicURL)
		if err != nil {
			t.Fatal(err)
		}
		got, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK || !bytes.Equal(got, img) {
			t.Fatalf("GET public URL = %d, %q", res.StatusCode, got)
		}
	}

	// ── Saving URLs ─────────────────────────────────────────────────────────
	const shopQ = `mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { logoUrl bannerUrl } }`
	seller.expectCode(graph.CodeBadInput, shopQ, map[string]any{"id": shopID, "in": map[string]any{"logoUrl": "https://cdn.example.com/logo.png"}})
	// A URL issued for a coffee can't become the shop logo.
	var photo struct{ CreateImageUpload upload }
	seller.mustDo(uploadQ, in("COFFEE_PHOTO", coffeeID, "image/webp", 2048), &photo)
	seller.expectCode(graph.CodeBadInput, shopQ, map[string]any{"id": shopID, "in": map[string]any{"bannerUrl": photo.CreateImageUpload.PublicURL}})

	var saved struct {
		UpdateShop struct{ LogoURL, BannerURL *string }
	}
	seller.mustDo(shopQ, map[string]any{"id": shopID, "in": map[string]any{"logoUrl": lu.PublicURL}}, &saved)
	if saved.UpdateShop.LogoURL == nil || *saved.UpdateShop.LogoURL != lu.PublicURL {
		t.Fatalf("logo not saved: %+v", saved)
	}
	seller.mustDo(shopQ, map[string]any{"id": shopID, "in": map[string]any{"name": "上傳測試 2"}}, &saved)
	if saved.UpdateShop.LogoURL == nil {
		t.Fatal("unrelated update cleared the logo")
	}
	seller.mustDo(shopQ, map[string]any{"id": shopID, "in": map[string]any{"logoUrl": ""}}, &saved)
	if saved.UpdateShop.LogoURL != nil {
		t.Fatalf("empty logoUrl must clear it: %+v", saved)
	}

	const coffeeQ = `mutation($id: ID!, $urls: [String!]) { updateCoffee(id: $id, input: {imageUrls: $urls}) { imageUrls } }`
	seller.expectCode(graph.CodeBadInput, coffeeQ, map[string]any{"id": coffeeID, "urls": []string{lu.PublicURL}})
	seller.expectCode(graph.CodeBadInput, coffeeQ, map[string]any{"id": coffeeID, "urls": []string{"javascript:alert(1)"}})
	var urls []string
	for range 9 {
		var p struct{ CreateImageUpload upload }
		seller.mustDo(uploadQ, in("COFFEE_PHOTO", coffeeID, "image/jpeg", 1000), &p)
		urls = append(urls, p.CreateImageUpload.PublicURL)
	}
	seller.expectCode(graph.CodeBadInput, coffeeQ, map[string]any{"id": coffeeID, "urls": urls})
	var gallery struct{ UpdateCoffee struct{ ImageUrls []string } }
	seller.mustDo(coffeeQ, map[string]any{"id": coffeeID, "urls": []string{urls[1], urls[0], urls[1]}}, &gallery)
	if g := gallery.UpdateCoffee.ImageUrls; len(g) != 2 || g[0] != urls[1] || g[1] != urls[0] {
		t.Fatalf("gallery order/dedupe wrong: %v", g)
	}
	seller.mustDo(coffeeQ, map[string]any{"id": coffeeID, "urls": []string{}}, &gallery)
	if len(gallery.UpdateCoffee.ImageUrls) != 0 {
		t.Fatalf("[] must clear the gallery: %v", gallery.UpdateCoffee.ImageUrls)
	}
}
