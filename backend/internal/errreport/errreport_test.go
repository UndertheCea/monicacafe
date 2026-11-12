package errreport

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParseDSN(t *testing.T) {
	tests := []struct {
		in       string
		endpoint string
		key      string
		wantErr  bool
	}{
		{"", "", "", false},
		{"  ", "", "", false},
		{"https://abc123@o1.ingest.sentry.io/42", "https://o1.ingest.sentry.io/api/42/envelope/", "abc123", false},
		{"https://abc@errors.example.com/sentry/7", "https://errors.example.com/sentry/api/7/envelope/", "abc", false},
		{"http://k@localhost:9000/1", "http://localhost:9000/api/1/envelope/", "k", false},
		{"https://o1.ingest.sentry.io/42", "", "", true},
		{"https://k@o1.ingest.sentry.io/", "", "", true},
		{"https://k@o1.ingest.sentry.io/abc", "", "", true},
		{"ftp://k@host/1", "", "", true},
		{"not a dsn", "", "", true},
	}
	for _, tc := range tests {
		got, err := ParseDSN(tc.in)
		if (err != nil) != tc.wantErr || got.Endpoint != tc.endpoint || got.Key != tc.key {
			t.Errorf("ParseDSN(%q) = %+v, %v; want %q key %q err=%v", tc.in, got, err, tc.endpoint, tc.key, tc.wantErr)
		}
	}
}

func TestScrub(t *testing.T) {
	jwt := "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl"
	tests := []struct {
		name, in string
		gone     []string // must not survive
		kept     string   // must survive
	}{
		{"email", "duplicate key: Key (email)=(ann@example.com) already exists", []string{"ann@example.com"}, "duplicate key"},
		{"jwt", "bad token " + jwt, []string{jwt}, "bad token"},
		{"bearer", "Authorization: Bearer abc.DEF-123_xyz", []string{"abc.DEF-123_xyz"}, ""},
		{"password assignment", `login failed password="hunter2 hunter3" for x`, []string{"hunter2", "hunter3"}, "login failed"},
		{"token assignment", "refresh_token=abcdef123456 ok", []string{"abcdef123456"}, "ok"},
		{"database url", "dial postgres://monica:monica_secret@db:5432/monicacafe: refused", []string{"monica_secret", "@db"}, "refused"},
		{"bcrypt hash", "hash $2a$12$" + strings.Repeat("a", 53) + " mismatch", []string{strings.Repeat("a", 53)}, "mismatch"},
		{"long hex", "key " + strings.Repeat("ab12", 12), []string{strings.Repeat("ab12", 12)}, "key"},
		{"plain text untouched", "runtime error: index out of range [3] with length 2", nil, "index out of range [3] with length 2"},
	}
	for _, tc := range tests {
		got := Scrub(tc.in)
		for _, g := range tc.gone {
			if strings.Contains(got, g) {
				t.Errorf("%s: %q survived in %q", tc.name, g, got)
			}
		}
		if !strings.Contains(got, tc.kept) {
			t.Errorf("%s: lost %q in %q", tc.name, tc.kept, got)
		}
	}
}

func TestBuildEnvelope(t *testing.T) {
	now := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	body, err := BuildEnvelope(Event{
		Kind: "panic", Message: "boom for ann@example.com", Stack: "goroutine 1\nsecret=abc",
		Method: "POST", Path: "/graphql", Operation: "Login", RequestID: "req-1",
	}, "production", "abc123", now)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(string(body)), "\n")
	if len(lines) != 3 {
		t.Fatalf("envelope has %d lines, want 3", len(lines))
	}
	var ev struct {
		Environment string            `json:"environment"`
		Release     string            `json:"release"`
		Tags        map[string]string `json:"tags"`
		Request     map[string]string `json:"request"`
		Exception   struct {
			Values []struct{ Type, Value string }
		}
		Extra map[string]string
		User  any `json:"user"`
	}
	if err := json.Unmarshal([]byte(lines[2]), &ev); err != nil {
		t.Fatal(err)
	}
	if ev.Environment != "production" || ev.Release != "abc123" || ev.Tags["operation"] != "Login" || ev.Request["method"] != "POST" {
		t.Errorf("unexpected event: %+v", ev)
	}
	if ev.User != nil {
		t.Error("events must not carry a user")
	}
	all := string(body)
	for _, leak := range []string{"ann@example.com", "secret=abc"} {
		if strings.Contains(all, leak) {
			t.Errorf("%q leaked into the envelope", leak)
		}
	}
}

func TestNewAndSend(t *testing.T) {
	r, err := New(Options{})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := r.(Noop); !ok {
		t.Fatalf("no DSN should give Noop, got %T", r)
	}
	r.Report(Event{Message: "x"}) // must not panic
	if _, err := New(Options{DSN: "garbage"}); err == nil {
		t.Fatal("a bad DSN should be refused")
	}

	got := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		b, _ := io.ReadAll(req.Body)
		got <- req.URL.Path + "|" + req.Header.Get("X-Sentry-Auth") + "|" + string(b)
	}))
	defer srv.Close()
	dsn := strings.Replace(srv.URL, "http://", "http://pub@", 1) + "/9"
	rep, err := New(Options{DSN: dsn, Environment: "test"})
	if err != nil {
		t.Fatal(err)
	}
	rep.Report(Event{Kind: "internal_error", Message: "db down"})
	rep.Close(context.Background())
	select {
	case s := <-got:
		if !strings.HasPrefix(s, "/api/9/envelope/|Sentry sentry_version=7") || !strings.Contains(s, "sentry_key=pub") || !strings.Contains(s, "db down") {
			t.Errorf("unexpected request: %s", s)
		}
	default:
		t.Fatal("Close should flush the queued event")
	}
	rep.Report(Event{Message: "after close"}) // dropped, no panic
}
