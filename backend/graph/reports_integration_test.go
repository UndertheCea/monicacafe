package graph_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
	"github.com/underthecea/monicacafe/backend/internal/ratelimit"
)

// TestReports (#225): a signed-in visitor reports a comment, a shop and a
// coffee; the admin lists the open reports and resolves them (dismiss, mark
// handled, take down), each closing every open report on the same target and
// writing the audit log. Anonymous visitors can't report, non-admins can't
// list or resolve, unknown or hidden targets are NOT_FOUND, reports are rate
// limited, and deleting the reporter's account keeps the report. Requires
// TEST_DATABASE_URL.
func TestReports(t *testing.T) {
	const perHour = 5
	url, pool := newTestServerWith(t, func(r *graph.Resolver) {
		r.Limits.ReportUser = ratelimit.New(ratelimit.Rule{Burst: perHour, Per: time.Hour})
	})
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	anon := &gqlClient{t: t, url: url}
	admin, adminAuth := register(t, url, "repadmin+"+run+"@example.com")
	seller, _ := register(t, url, "repseller+"+run+"@example.com")
	buyer, _ := register(t, url, "repbuyer+"+run+"@example.com")
	reporter, reporterAuth := register(t, url, "reporter+"+run+"@example.com")
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'ADMIN' WHERE id = $1`, adminAuth.User.ID); err != nil {
		t.Fatal(err)
	}

	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(`mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"slug": "rep-" + run, "name": "檢舉測試 " + run, "description": "", "city": "台中市"}}, &shop)
	shopID := shop.CreateShop.ID
	publishTestCoffee(t, pool, shopID)
	publishTestCoffee(t, pool, shopID)
	var coffeeID, draftID string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1 ORDER BY id LIMIT 1`, shopID).Scan(&coffeeID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `UPDATE coffees SET is_published = false
		WHERE id = (SELECT id FROM coffees WHERE shop_id = $1 AND id <> $2 LIMIT 1) RETURNING id`, shopID, coffeeID).Scan(&draftID); err != nil {
		t.Fatal(err)
	}
	var cm struct{ AddComment struct{ ID string } }
	buyer.mustDo(`mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`,
		map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "賣家很不友善"}}, &cm)
	commentID := cm.AddComment.ID

	const reportQ = `mutation($tt: ReportTargetType!, $id: ID!, $r: ReportReason!, $n: String) {
		report(targetType: $tt, targetId: $id, reason: $r, note: $n) }`
	rep := func(tt, id, reason string) map[string]any {
		return map[string]any{"tt": tt, "id": id, "r": reason}
	}

	// ── Who may report, and what ──────────────────────────────────────────────
	anon.expectCode(graph.CodeUnauthenticated, reportQ, rep("COMMENT", commentID, "SPAM"))
	missing := "00000000-0000-4000-8000-00000000dead"
	for _, tc := range []struct{ name, tt, id string }{
		{"unknown comment", "COMMENT", missing},
		{"unknown shop", "SHOP", missing},
		{"unknown coffee", "COFFEE", missing},
		{"not a UUID", "COFFEE", "nope"},
		{"someone else's draft", "COFFEE", draftID},
	} {
		t.Run("not found/"+tc.name, func(t *testing.T) {
			reporter.t = t
			defer func() { reporter.t = nil }()
			reporter.expectCode(graph.CodeNotFound, reportQ, rep(tc.tt, tc.id, "OTHER"))
		})
	}
	reporter.t = t
	long := map[string]any{"tt": "SHOP", "id": shopID, "r": "OTHER", "n": strings.Repeat("字", 501)}
	reporter.expectCode(graph.CodeBadInput, reportQ, long)

	var ok struct{ Report bool }
	reporter.mustDo(reportQ, map[string]any{"tt": "COMMENT", "id": commentID, "r": "CONTACT_INFO", "n": "留了 LINE"}, &ok)
	if !ok.Report {
		t.Fatal("report returned false")
	}
	reporter.mustDo(reportQ, rep("COMMENT", commentID, "SPAM"), nil) // again while open: no second row
	reporter.mustDo(reportQ, rep("SHOP", shopID, "MISLEADING"), nil)
	reporter.mustDo(reportQ, rep("COFFEE", coffeeID, "MISLEADING"), nil)
	buyer.mustDo(reportQ, rep("SHOP", shopID, "SPAM"), nil) // a second reporter, same target
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM reports WHERE target_id = $1 AND status = 'OPEN'`, commentID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("open reports on the comment = %d, want 1 (one per reporter per target)", n)
	}
	// Five tokens spent (the repeat counts too): the sixth is refused.
	reporter.mustDo(reportQ, rep("SHOP", shopID, "SPAM"), nil)
	reporter.expectCode(graph.CodeRateLimited, reportQ, rep("SHOP", shopID, "SPAM"))

	// ── Admin only ────────────────────────────────────────────────────────────
	const listQ = `query($s: ReportStatus) { reports(status: $s, limit: 100) { total nodes {
		id targetType targetId reason note status handledAt
		reporter { id } handledBy { id }
		comment { id body } shop { id } coffee { id } } } }`
	const resolveQ = `mutation($id: ID!, $a: ReportResolution!, $r: String) {
		resolveReport(id: $id, action: $a, reason: $r) { id status handledBy { id } } }`
	anon.expectCode(graph.CodeUnauthenticated, listQ, nil)
	buyer.expectCode(graph.CodeForbidden, listQ, nil)
	seller.expectCode(graph.CodeForbidden, listQ, nil)

	type reportRow struct {
		ID, TargetType, TargetID, Reason, Note, Status string
		HandledAt                                      *string
		Reporter, HandledBy                            *struct{ ID string }
		Comment                                        *struct{ ID, Body string }
		Shop, Coffee                                   *struct{ ID string }
	}
	list := func(status string) map[string][]reportRow {
		var out struct {
			Reports struct{ Nodes []reportRow }
		}
		admin.mustDo(listQ, map[string]any{"s": status}, &out)
		mine := map[string][]reportRow{}
		for _, r := range out.Reports.Nodes {
			if r.TargetID == commentID || r.TargetID == shopID || r.TargetID == coffeeID {
				mine[r.TargetType] = append(mine[r.TargetType], r)
			}
		}
		return mine
	}
	open := list("OPEN")
	if len(open["COMMENT"]) != 1 || len(open["SHOP"]) != 2 || len(open["COFFEE"]) != 1 {
		t.Fatalf("open reports: %+v", open)
	}
	c := open["COMMENT"][0]
	if c.Reason != "CONTACT_INFO" || c.Note != "留了 LINE" || c.Status != "OPEN" || c.HandledAt != nil ||
		c.Reporter == nil || c.Reporter.ID != reporterAuth.User.ID || c.Comment == nil || c.Comment.Body != "賣家很不友善" ||
		c.Shop != nil || c.Coffee != nil {
		t.Fatalf("comment report = %+v", c)
	}
	if open["SHOP"][0].Shop == nil || open["COFFEE"][0].Coffee == nil {
		t.Fatalf("targets not resolved: %+v", open)
	}

	buyer.expectCode(graph.CodeForbidden, resolveQ, map[string]any{"id": c.ID, "a": "DISMISS"})
	anon.expectCode(graph.CodeUnauthenticated, resolveQ, map[string]any{"id": c.ID, "a": "DISMISS"})
	admin.expectCode(graph.CodeBadInput, resolveQ, map[string]any{"id": c.ID, "a": "REMOVE"}) // reason required
	admin.expectCode(graph.CodeNotFound, resolveQ, map[string]any{"id": missing, "a": "DISMISS"})

	// ── Resolve ───────────────────────────────────────────────────────────────
	type resolved struct {
		ResolveReport struct {
			Status    string
			HandledBy *struct{ ID string }
		}
	}
	var res resolved
	// Taking the comment down deletes it, in the same transaction.
	admin.mustDo(resolveQ, map[string]any{"id": c.ID, "a": "REMOVE", "r": "contact details"}, &res)
	if res.ResolveReport.Status != "ACTIONED" || res.ResolveReport.HandledBy == nil || res.ResolveReport.HandledBy.ID != adminAuth.User.ID {
		t.Fatalf("resolved = %+v", res)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM comments WHERE id = $1`, commentID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("comment should be deleted (count %d, err %v)", n, err)
	}
	admin.expectCode(graph.CodeBadInput, resolveQ, map[string]any{"id": c.ID, "a": "DISMISS"}) // already closed

	// Dismissing one report on the shop closes the other reporter's too.
	admin.mustDo(resolveQ, map[string]any{"id": open["SHOP"][0].ID, "a": "DISMISS"}, &res)
	if res.ResolveReport.Status != "DISMISSED" {
		t.Fatalf("dismissed = %+v", res)
	}
	admin.mustDo(resolveQ, map[string]any{"id": open["COFFEE"][0].ID, "a": "ACTIONED", "r": "talked to the seller"}, &res)
	if left := list("OPEN"); len(left) != 0 {
		t.Fatalf("open reports left: %+v", left)
	}
	if d := list("DISMISSED"); len(d["SHOP"]) != 2 || d["SHOP"][0].HandledAt == nil {
		t.Fatalf("dismissed shop reports: %+v", d)
	}
	actioned := list("ACTIONED")
	if len(actioned["COMMENT"]) != 1 || actioned["COMMENT"][0].Comment != nil {
		t.Fatalf("actioned comment report (target deleted): %+v", actioned["COMMENT"])
	}
	var shopVisible struct{ Shop *struct{ ID string } }
	anon.mustDo(`query($s: String!) { shop(slug: $s) { id } }`, map[string]any{"s": "rep-" + run}, &shopVisible)
	if shopVisible.Shop == nil {
		t.Fatal("dismissing must leave the shop up")
	}

	// A fresh report on the shop, taken down: the shop is suspended.
	reporter2, _ := register(t, url, "reporter2+"+run+"@example.com")
	reporter2.mustDo(reportQ, rep("SHOP", shopID, "MISLEADING"), nil)
	again := list("OPEN")["SHOP"]
	if len(again) != 1 {
		t.Fatalf("new shop report: %+v", again)
	}
	admin.mustDo(resolveQ, map[string]any{"id": again[0].ID, "a": "REMOVE", "r": "counterfeit"}, nil)
	anon.mustDo(`query($s: String!) { shop(slug: $s) { id } }`, map[string]any{"s": "rep-" + run}, &shopVisible)
	if shopVisible.Shop != nil {
		t.Fatal("taking a shop down should suspend it")
	}
	reporter2.expectCode(graph.CodeNotFound, reportQ, rep("SHOP", shopID, "SPAM")) // suspended: hidden

	// ── Audit log ─────────────────────────────────────────────────────────────
	var log struct {
		AuditLog struct {
			Nodes []struct{ Action, TargetID, Reason string }
		}
	}
	admin.mustDo(`{ auditLog(limit: 100) { nodes { action targetId reason } } }`, nil, &log)
	want := []struct{ action, target, reason string }{
		{"ACTION_REPORT", shopID, "counterfeit"},
		{"SUSPEND_SHOP", shopID, "counterfeit"},
		{"ACTION_REPORT", coffeeID, "talked to the seller"},
		{"DISMISS_REPORT", shopID, ""},
		{"ACTION_REPORT", commentID, "contact details"},
		{"DELETE_COMMENT", commentID, "contact details"},
	}
	// A take-down and its report share a transaction (and created_at), so
	// compare as a set rather than in order.
	got := map[struct{ action, target, reason string }]int{}
	for _, e := range log.AuditLog.Nodes {
		if e.TargetID == shopID || e.TargetID == coffeeID || e.TargetID == commentID {
			got[struct{ action, target, reason string }{e.Action, e.TargetID, e.Reason}]++
		}
	}
	for _, w := range want {
		if got[w] != 1 {
			t.Errorf("audit entry %+v appears %d times; all: %+v", w, got[w], got)
		}
	}

	// ── Deleting the reporter's account keeps the report ─────────────────────
	reporter.mustDo(`mutation($p: String!) { deleteAccount(password: $p) }`, map[string]any{"p": "correct-horse-battery"}, nil)
	var reporterGone bool
	if err := pool.QueryRow(ctx, `SELECT bool_and(reporter_id IS NULL) FROM reports WHERE target_id = $1`, coffeeID).Scan(&reporterGone); err != nil {
		t.Fatal(err)
	}
	if !reporterGone {
		t.Fatal("the deleted reporter's reports should remain, without a reporter")
	}
	if d := list("ACTIONED"); len(d["COFFEE"]) != 1 || d["COFFEE"][0].Reporter != nil {
		t.Fatalf("report after the reporter was deleted: %+v", d["COFFEE"])
	}
}

// TestContactInfoRefused (#225): new comments and edits, and new or changed
// shop and coffee descriptions, can't carry phone numbers, emails, links or
// LINE IDs; text stored before the rule can be sent back unchanged.
func TestContactInfoRefused(t *testing.T) {
	url, pool := newTestServer(t)
	ctx := context.Background()
	run := fmt.Sprintf("%d", time.Now().UnixNano())
	seller, _ := register(t, url, "ciseller+"+run+"@example.com")
	buyer, _ := register(t, url, "cibuyer+"+run+"@example.com")
	const code = "CONTACT_INFO_NOT_ALLOWED"

	createShop := `mutation($in: CreateShopInput!) { createShop(input: $in) { id } }`
	shopIn := func(desc string) map[string]any {
		return map[string]any{"in": map[string]any{"slug": "ci-" + run, "name": "聯絡測試", "description": desc, "city": "台北市"}}
	}
	seller.expectCode(code, createShop, shopIn("訂購請加 LINE ID: beans123"))
	var shop struct{ CreateShop struct{ ID string } }
	seller.mustDo(createShop, shopIn("台北的小烘豆室，海拔 1,900–2,200 m 的豆子"), &shop)
	shopID := shop.CreateShop.ID

	updateShop := `mutation($id: ID!, $d: String!) { updateShop(id: $id, input: {description: $d}) { id } }`
	seller.expectCode(code, updateShop, map[string]any{"id": shopID, "d": "官網 www.beans.tw"})
	// A description saved before the rule can be sent back as it is.
	const legacy = "老客人請打 02-2345-6789"
	if _, err := pool.Exec(ctx, `UPDATE shops SET description = $2 WHERE id = $1`, shopID, legacy); err != nil {
		t.Fatal(err)
	}
	seller.mustDo(updateShop, map[string]any{"id": shopID, "d": legacy}, nil)
	seller.expectCode(code, updateShop, map[string]any{"id": shopID, "d": legacy + "（週一公休）"})

	publishTestCoffee(t, pool, shopID)
	var coffeeID string
	if err := pool.QueryRow(ctx, `SELECT id FROM coffees WHERE shop_id = $1`, shopID).Scan(&coffeeID); err != nil {
		t.Fatal(err)
	}
	updateCoffee := `mutation($id: ID!, $d: String!) { updateCoffee(id: $id, input: {description: $d}) { id } }`
	seller.expectCode(code, updateCoffee, map[string]any{"id": coffeeID, "d": "email me: roaster@gmail.com"})
	seller.mustDo(updateCoffee, map[string]any{"id": coffeeID, "d": "SL28, Geisha 1931, 2024/25 產季, NT$450 / 200 g"}, nil)

	addComment := `mutation($in: AddCommentInput!) { addComment(input: $in) { id } }`
	buyer.expectCode(code, addComment, map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "便宜賣你，打 ０９１２-３４５-６７８"}})
	var cm struct{ AddComment struct{ ID string } }
	buyer.mustDo(addComment, map[string]any{"in": map[string]any{"coffeeId": coffeeID, "body": "莓果調性很明顯，3.5 分鐘萃取剛好"}}, &cm)
	buyer.expectCode(code, `mutation($id: ID!) { updateComment(id: $id, body: "看 https://example.com") { id } }`,
		map[string]any{"id": cm.AddComment.ID})
}
