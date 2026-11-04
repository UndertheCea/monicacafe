package apperr

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

func TestPresenter(t *testing.T) {
	ctx := graphql.WithResponseContext(context.Background(), graphql.DefaultErrorPresenter, graphql.DefaultRecover)

	tests := []struct {
		name      string
		err       error
		wantCode  string // "" = no extensions expected
		wantMsg   string
		wantField string
	}{
		{"not found", NotFound("咖啡", "coffee"), "NOT_FOUND", "找不到咖啡", ""},
		{"bad input keeps field", BadInput("id", "ID 格式錯誤", "invalid id"), "BAD_USER_INPUT", "ID 格式錯誤", "id"},
		{"wrapped app error", fmt.Errorf("ctx: %w", Unauthenticated()), "UNAUTHENTICATED", "請先登入", ""},
		{"not implemented", NotImplemented("login"), "NOT_IMPLEMENTED", "此功能尚未開放：login", ""},
		{"raw error hidden", errors.New("pq: password=secret"), "INTERNAL", "系統發生錯誤，請稍後再試", ""},
		{"internal hides cause", Internal(errors.New("db down")), "INTERNAL", "系統發生錯誤，請稍後再試", ""},
		{"gqlgen validation error untouched", gqlerror.Errorf("bad query"), "", "bad query", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Presenter(ctx, tt.err)
			if got.Message != tt.wantMsg {
				t.Errorf("message = %q, want %q", got.Message, tt.wantMsg)
			}
			if tt.wantCode == "" {
				if got.Extensions["code"] != nil {
					t.Errorf("unexpected code %v", got.Extensions["code"])
				}
				return
			}
			if got.Extensions["code"] != tt.wantCode {
				t.Errorf("code = %v, want %s", got.Extensions["code"], tt.wantCode)
			}
			if got.Extensions["messageEn"] == "" || got.Extensions["messageZh"] == "" {
				t.Errorf("missing bilingual messages: %v", got.Extensions)
			}
			f, _ := got.Extensions["field"].(string)
			if f != tt.wantField {
				t.Errorf("field = %q, want %q", f, tt.wantField)
			}
		})
	}
}

func TestRecover(t *testing.T) {
	err := Recover(context.Background(), "boom")
	var ae *Error
	if !errors.As(err, &ae) || ae.Code != CodeInternal {
		t.Fatalf("Recover() = %v, want INTERNAL *Error", err)
	}
}
