package graph

import (
	"errors"
	"testing"

	"github.com/underthecea/monicacafe/backend/graph/model"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

func TestReportOutcome(t *testing.T) {
	cases := []struct {
		action     model.ReportResolution
		status     string
		remove, ok bool
	}{
		{model.ReportResolutionDismiss, store.ReportDismissed, false, true},
		{model.ReportResolutionActioned, store.ReportActioned, false, true},
		{model.ReportResolutionRemove, store.ReportActioned, true, true},
		{model.ReportResolution("DELETE_EVERYTHING"), "", false, false},
	}
	for _, c := range cases {
		status, remove, ok := reportOutcome(c.action)
		if status != c.status || remove != c.remove || ok != c.ok {
			t.Errorf("reportOutcome(%s) = %q %v %v, want %q %v %v", c.action, status, remove, ok, c.status, c.remove, c.ok)
		}
	}
}

func TestNoNewContactInfo(t *testing.T) {
	str := func(s string) *string { return &s }
	const stored = "舊的介紹 LINE ID: oldshop"
	cases := []struct {
		name string
		text *string
		want bool // true = refused
	}{
		{"not being changed", nil, false},
		{"stored text sent back unchanged", str(stored), false},
		{"new clean text", str("衣索比亞，花香"), false},
		{"new text with a phone number", str("請打 0912-345-678"), true},
		{"edited text keeping the old LINE ID", str(stored + "。新增產季"), true},
		{"emptied", str(""), false},
	}
	for _, c := range cases {
		err := noNewContactInfo("description", c.text, stored)
		var ae *apiError
		refused := errors.As(err, &ae) && ae.code == CodeContactInfo && ae.field == "description"
		if refused != c.want || (err != nil && !refused) {
			t.Errorf("%s: err = %v, want refused %v", c.name, err, c.want)
		}
	}
}
