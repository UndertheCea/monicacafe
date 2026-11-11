package graph_test

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/mediaclean"
	"github.com/underthecea/monicacafe/backend/internal/storage"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

// TestMediaCleanup uploads two images for a shop, saves only one, and checks
// that a sweep deletes the unsaved one from the real bucket and keeps the
// saved one. Requires TEST_DATABASE_URL and TEST_S3_ENDPOINT.
func TestMediaCleanup(t *testing.T) {
	if os.Getenv("TEST_S3_ENDPOINT") == "" {
		t.Skip("TEST_S3_ENDPOINT not set; skipping bucket cleanup test")
	}
	url, pool := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "mclean+"+run+"@example.com")
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "mclean-" + run, "name": "清理測試", "description": "", "city": "嘉義市"}}, &shop)
	shopID := shop.CreateShop.ID

	upload := func(kind string) (publicURL string) {
		var out struct {
			CreateImageUpload struct{ UploadURL, PublicURL string }
		}
		img := []byte("\x89PNG fake " + kind + run)
		seller.mustDo(`mutation($in: ImageUploadInput!) { createImageUpload(input: $in) { uploadUrl publicUrl } }`,
			map[string]any{"in": map[string]any{"kind": kind, "targetId": shopID, "contentType": "image/png", "byteSize": len(img)}}, &out)
		req, _ := http.NewRequest(http.MethodPut, out.CreateImageUpload.UploadURL, bytes.NewReader(img))
		req.Header.Set("Content-Type", "image/png")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK {
			t.Fatalf("PUT %s = %d", kind, res.StatusCode)
		}
		return out.CreateImageUpload.PublicURL
	}
	kept, dropped := upload("SHOP_LOGO"), upload("SHOP_BANNER")
	seller.mustDo(`mutation($id: ID!, $in: UpdateShopInput!) { updateShop(id: $id, input: $in) { id } }`,
		map[string]any{"id": shopID, "in": map[string]any{"logoUrl": kept}}, nil)

	media := testMedia(t)
	ctx := context.Background()
	opts := mediaclean.Options{Prefixes: []string{storage.ShopPrefix(shopID)}}

	// Young objects survive the default safety margin.
	res, err := mediaclean.Sweep(ctx, media, store.New(pool).ReferencedImageKeys, time.Now(), mediaclean.Options{MinAge: time.Hour, Prefixes: opts.Prefixes})
	if err != nil || res.Scanned != 2 || res.Deleted != 0 {
		t.Fatalf("sweep with min age: %+v, %v", res, err)
	}
	res, err = mediaclean.Sweep(ctx, media, store.New(pool).ReferencedImageKeys, time.Now(), opts)
	if err != nil || res.Scanned != 2 || res.Orphans != 1 || res.Deleted != 1 {
		t.Fatalf("sweep: %+v, %v", res, err)
	}
	status := func(u string) int {
		r, err := http.Get(u)
		if err != nil {
			t.Fatal(err)
		}
		r.Body.Close()
		return r.StatusCode
	}
	if got := status(kept); got != http.StatusOK {
		t.Fatalf("saved logo GET = %d, want 200", got)
	}
	if got := status(dropped); got != http.StatusNotFound {
		t.Fatalf("unsaved banner GET = %d, want 404", got)
	}
	// Deleting is idempotent and the bucket now holds just the logo.
	if err := media.DeleteObject(ctx, storage.ImageKeyIn(dropped)); err != nil {
		t.Fatalf("delete missing object: %v", err)
	}
	objs, _, err := media.ListObjects(ctx, storage.ShopPrefix(shopID), "")
	if err != nil || len(objs) != 1 || objs[0].Key != storage.ImageKeyIn(kept) {
		t.Fatalf("listing after sweep: %+v, %v", objs, err)
	}
}
