package middleware

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRecoverCallsHooks(t *testing.T) {
	tests := []struct {
		name      string
		panicWith any
		wantText  string
		wantCalls int
	}{
		{"string panic", "boom", "boom", 1},
		{"error panic", io.ErrUnexpectedEOF, "unexpected EOF", 1},
		{"no panic", nil, "", 0},
	}
	for _, tc := range tests {
		var calls int
		var gotText, gotPath string
		var gotStack []byte
		h := Recover(slog.New(slog.NewTextHandler(io.Discard, nil)), func(r *http.Request, rec any, stack []byte) {
			calls++
			gotText, gotPath, gotStack = PanicText(rec), r.URL.Path, stack
		})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if tc.panicWith != nil {
				panic(tc.panicWith)
			}
		}))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
		if calls != tc.wantCalls || gotText != tc.wantText {
			t.Errorf("%s: hook calls=%d text=%q; want %d / %q", tc.name, calls, gotText, tc.wantCalls, tc.wantText)
		}
		if tc.wantCalls == 1 && (gotPath != "/x" || len(gotStack) == 0 || rec.Code != http.StatusInternalServerError) {
			t.Errorf("%s: path=%q stack=%d bytes status=%d", tc.name, gotPath, len(gotStack), rec.Code)
		}
	}
}
