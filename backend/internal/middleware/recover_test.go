package middleware

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	chimiddleware "github.com/go-chi/chi/v5/middleware"
)

func TestRecover(t *testing.T) {
	tests := []struct {
		name        string
		handler     http.HandlerFunc
		wantCode    int
		wantLog     bool
		wantPanic   string
		wantSent    bool
		wantBodyHas string
	}{
		{"no panic untouched", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("fine")) }, 200, false, "", false, "fine"},
		{"string panic", func(http.ResponseWriter, *http.Request) { panic("boom") }, 500, true, "boom", false, "Internal Server Error"},
		{"error panic", func(http.ResponseWriter, *http.Request) { panic(errors.New("nil map")) }, 500, true, "nil map", false, "Internal Server Error"},
		{"other value", func(http.ResponseWriter, *http.Request) { panic(42) }, 500, true, "42", false, "Internal Server Error"},
		{"after headers sent", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte("partial"))
			panic("late")
		}, 202, true, "late", true, "partial"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&buf, nil))
			h := chimiddleware.RequestID(Recover(logger)(tc.handler))
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/graphql?x=1", nil))

			if rr.Code != tc.wantCode {
				t.Errorf("status = %d, want %d", rr.Code, tc.wantCode)
			}
			if body := rr.Body.String(); !strings.Contains(body, tc.wantBodyHas) || (tc.wantSent && strings.Contains(body, "Internal")) {
				t.Errorf("body = %q", body)
			}
			if !tc.wantLog {
				if buf.Len() != 0 {
					t.Fatalf("unexpected log: %s", buf.String())
				}
				return
			}
			var rec map[string]any
			if err := json.Unmarshal(buf.Bytes(), &rec); err != nil {
				t.Fatalf("not one JSON record: %v (%q)", err, buf.String())
			}
			for k, want := range map[string]any{
				"level": "ERROR", "msg": "panic recovered", "panic": tc.wantPanic,
				"method": "POST", "path": "/graphql", "headers_sent": tc.wantSent,
			} {
				if rec[k] != want {
					t.Errorf("%s = %v, want %v", k, rec[k], want)
				}
			}
			if id, _ := rec["request_id"].(string); id == "" {
				t.Error("request_id missing")
			}
			if stack, _ := rec["stack"].(string); !strings.Contains(stack, "goroutine") {
				t.Errorf("stack missing: %q", stack)
			}
		})
	}
}

func TestRecoverRepanicsAbortHandler(t *testing.T) {
	var buf bytes.Buffer
	h := Recover(slog.New(slog.NewJSONHandler(&buf, nil)))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	}))
	defer func() {
		if rec := recover(); rec != http.ErrAbortHandler {
			t.Fatalf("recovered %v, want http.ErrAbortHandler", rec)
		}
		if buf.Len() != 0 {
			t.Fatalf("abort should not be logged: %s", buf.String())
		}
	}()
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
}
