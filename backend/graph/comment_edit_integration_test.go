package graph_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

// TestUpdateComment covers updateComment: author only, body validation,
// unchanged text leaves editedAt null, edits show on Coffee.comments, and a
// coffee back in draft can't be commented on by editing. Requires TEST_DATABASE_URL.
func TestUpdateComment(t *testing.T) {
	url, _ := newTestServer(t)
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "ceseller+"+run+"@example.com")
	author, _ := register(t, url, "ceauthor+"+run+"@example.com")
	other, _ := register(t, url, "ceother+"+run+"@example.com")
	anon := &gqlClient{t: t, url: url}

	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "ce-" + run, "name": "留言編輯", "description": "", "city": "台南市"}}, nil)
	var refs struct {
		OriginCountries   []struct{ ID string }
		ProcessingMethods []struct{ ID string }
	}
	anon.mustDo(`{ originCountries { id } processingMethods { id } }`, nil, &refs)
	var co struct{ CreateCoffee struct{ ID string } }
	seller.mustDo(`mutation($in: CreateCoffeeInput!) { createCoffee(input: $in) { id } }`,
		map[string]any{"in": map[string]any{
			"name": "Edit Me", "description": "", "roastLevel": "MEDIUM", "flavorNotes": []string{"Citrus"},
			"originCountryId": refs.OriginCountries[0].ID, "processingMethodId": refs.ProcessingMethods[0].ID,
			"variants": []map[string]any{{"grind": "WHOLE_BEAN", "weightG": 200, "priceTwd": 400, "stock": 3}},
		}}, &co)
	coffeeID := co.CreateCoffee.ID
	seller.mustDo(`mutation($id: ID!) { publishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)

	var added struct {
		AddComment struct {
			ID       string
			EditedAt *time.Time
		}
	}
	author.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id editedAt } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "好喝"}}, &added)
	id := added.AddComment.ID
	if added.AddComment.EditedAt != nil {
		t.Fatalf("new comment has editedAt %v", added.AddComment.EditedAt)
	}

	const q = `mutation($id: ID!, $body: String!) { updateComment(id: $id, body: $body) { id body editedAt } }`
	type result struct {
		UpdateComment struct {
			ID, Body string
			EditedAt *time.Time
		}
	}
	vars := func(id, body string) map[string]any { return map[string]any{"id": id, "body": body} }

	errCases := []struct {
		name   string
		client *gqlClient
		vars   map[string]any
		code   string
	}{
		{"signed out", anon, vars(id, "x"), graph.CodeUnauthenticated},
		{"someone else", other, vars(id, "x"), graph.CodeForbidden},
		{"shop owner", seller, vars(id, "x"), graph.CodeForbidden},
		{"blank", author, vars(id, "   "), graph.CodeBadInput},
		{"too long", author, vars(id, strings.Repeat("咖", 501)), graph.CodeBadInput},
		{"unknown id", author, vars("00000000-0000-0000-0000-000000000000", "x"), graph.CodeNotFound},
		{"bad id", author, vars("nope", "x"), graph.CodeNotFound},
	}
	for _, tc := range errCases {
		t.Run(tc.name, func(t *testing.T) {
			tc.client.t = t
			defer func() { tc.client.t = nil }()
			tc.client.expectCode(tc.code, q, tc.vars)
		})
	}
	author.t, other.t, seller.t, anon.t = t, t, t, t

	// Unchanged text (after trimming) is a no-op.
	var same result
	author.mustDo(q, vars(id, "  好喝 "), &same)
	if same.UpdateComment.Body != "好喝" || same.UpdateComment.EditedAt != nil {
		t.Fatalf("unchanged body: %+v", same.UpdateComment)
	}

	var edited result
	author.mustDo(q, vars(id, "非常好喝"), &edited)
	if edited.UpdateComment.Body != "非常好喝" || edited.UpdateComment.EditedAt == nil {
		t.Fatalf("edit not applied: %+v", edited.UpdateComment)
	}
	var list struct {
		Coffee struct {
			CommentCount int
			Comments     []struct {
				ID, Body string
				EditedAt *time.Time
			}
		}
	}
	anon.mustDo(`query($id: ID!) { coffee(id: $id) { commentCount comments { id body editedAt } } }`, map[string]any{"id": coffeeID}, &list)
	if list.Coffee.CommentCount != 1 || list.Coffee.Comments[0].Body != "非常好喝" || list.Coffee.Comments[0].EditedAt == nil {
		t.Fatalf("public list after edit: %+v", list.Coffee)
	}

	// Back in draft: no new public text by editing.
	seller.mustDo(`mutation($id: ID!) { unpublishCoffee(id: $id) { id } }`, map[string]any{"id": coffeeID}, nil)
	author.expectCode(graph.CodeNotFound, q, vars(id, "改一下"))
}
