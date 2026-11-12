// Package errreport sends panics and server errors to a Sentry-compatible
// endpoint (#221). It is a small hand-written envelope sender instead of the
// sentry-go SDK: we report one kind of event from two places, and the SDK
// would add ~15 transitive modules plus global hub state for that. The cost is
// that we get no breadcrumbs or source context, which we don't want anyway
// (they are where user data leaks from).
//
// Everything goes through the Reporter interface; with no DSN configured the
// reporter is a no-op, so call sites never check.
package errreport

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Event is what call sites know about a failure. Only these fields ever leave
// the process; there is deliberately no user, header, cookie or body field.
type Event struct {
	// Kind is "panic" or "internal_error".
	Kind string
	// Message is the error or panic text (scrubbed before sending).
	Message string
	// Stack is a goroutine stack (scrubbed before sending); may be empty.
	Stack string
	// Method and Path of the HTTP request, without the query string.
	Method, Path string
	// Operation is the GraphQL operation name, when known.
	Operation string
	// RequestID correlates the event with the access log.
	RequestID string
}

// Reporter receives events. Report never blocks and never fails the request.
type Reporter interface {
	Report(Event)
	// Close flushes queued events until ctx ends.
	Close(ctx context.Context)
}

// Noop drops everything; it is what an unset SENTRY_DSN gives.
type Noop struct{}

func (Noop) Report(Event)          {}
func (Noop) Close(context.Context) {}

// DSN is a parsed Sentry DSN.
type DSN struct {
	// Endpoint is the envelope URL ("https://host/api/42/envelope/").
	Endpoint string
	// Key is the public key.
	Key string
}

// ParseDSN parses "https://<public key>@<host>[/<path>]/<project id>".
// The empty string parses to the zero DSN and no error (reporting off).
func ParseDSN(raw string) (DSN, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DSN{}, nil
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || u.User == nil || u.User.Username() == "" {
		return DSN{}, fmt.Errorf("errreport: SENTRY_DSN must look like https://<key>@<host>/<project id>")
	}
	path := strings.Trim(u.Path, "/")
	i := strings.LastIndex(path, "/")
	project, prefix := path, ""
	if i >= 0 {
		project, prefix = path[i+1:], path[:i+1]
	}
	if project == "" || strings.Trim(project, "0123456789") != "" {
		return DSN{}, fmt.Errorf("errreport: SENTRY_DSN must end in a numeric project id")
	}
	return DSN{
		Endpoint: fmt.Sprintf("%s://%s/%sapi/%s/envelope/", u.Scheme, u.Host, prefix, project),
		Key:      u.User.Username(),
	}, nil
}

// Options configure New.
type Options struct {
	DSN         string
	Environment string
	Release     string
	// Client defaults to one with a 5 s timeout.
	Client *http.Client
	Logger *slog.Logger
}

// New returns a Sentry sender when opts.DSN is set, else Noop.
func New(opts Options) (Reporter, error) {
	dsn, err := ParseDSN(opts.DSN)
	if err != nil {
		return nil, err
	}
	if dsn.Endpoint == "" {
		return Noop{}, nil
	}
	client := opts.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	s := &sender{dsn: dsn, env: opts.Environment, release: opts.Release, client: client, logger: logger,
		queue: make(chan []byte, queueSize), done: make(chan struct{})}
	go s.run()
	return s, nil
}

const queueSize = 32

type sender struct {
	dsn     DSN
	env     string
	release string
	client  *http.Client
	logger  *slog.Logger
	queue   chan []byte
	done    chan struct{}
	mu      sync.Mutex
	closed  bool
}

func (s *sender) Report(e Event) {
	body, err := BuildEnvelope(e, s.env, s.release, time.Now())
	if err != nil {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	select {
	case s.queue <- body:
	default: // a burst of errors must not pile up memory; the log has them all
	}
}

func (s *sender) run() {
	defer close(s.done)
	for body := range s.queue {
		req, err := http.NewRequest(http.MethodPost, s.dsn.Endpoint, bytes.NewReader(body))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/x-sentry-envelope")
		req.Header.Set("X-Sentry-Auth", "Sentry sentry_version=7, sentry_client=moni-go/1, sentry_key="+s.dsn.Key)
		res, err := s.client.Do(req)
		if err != nil {
			s.logger.Warn("error report not sent", "err", err.Error())
			continue
		}
		_ = res.Body.Close()
		if res.StatusCode >= 300 {
			s.logger.Warn("error report refused", "status", res.StatusCode)
		}
	}
}

func (s *sender) Close(ctx context.Context) {
	s.mu.Lock()
	if !s.closed {
		s.closed = true
		close(s.queue)
	}
	s.mu.Unlock()
	select {
	case <-s.done:
	case <-ctx.Done():
	}
}

// BuildEnvelope renders e as a Sentry envelope (header, item header, event),
// scrubbing every free-text field. Exported for tests.
func BuildEnvelope(e Event, environment, release string, now time.Time) ([]byte, error) {
	id := make([]byte, 16)
	if _, err := rand.Read(id); err != nil {
		return nil, err
	}
	eventID := hex.EncodeToString(id)
	kind := e.Kind
	if kind == "" {
		kind = "internal_error"
	}
	msg := Scrub(e.Message)
	tags := map[string]string{"kind": kind}
	if e.Operation != "" {
		tags["operation"] = Scrub(truncate(e.Operation, 64))
	}
	if e.RequestID != "" {
		tags["request_id"] = Scrub(truncate(e.RequestID, 64))
	}
	ev := map[string]any{
		"event_id":    eventID,
		"timestamp":   now.UTC().Format(time.RFC3339),
		"platform":    "go",
		"level":       "error",
		"logger":      "moni-api",
		"environment": environment,
		"tags":        tags,
		"exception": map[string]any{"values": []map[string]any{{
			"type":  kind,
			"value": truncate(msg, 2000),
		}}},
	}
	if release != "" {
		ev["release"] = release
	}
	if e.Method != "" || e.Path != "" {
		// Path only: query strings can carry tokens. No headers, cookies, body, client IP.
		ev["request"] = map[string]any{"method": e.Method, "url": Scrub(truncate(e.Path, 200))}
	}
	if e.Stack != "" {
		ev["extra"] = map[string]any{"stack": truncate(Scrub(e.Stack), 8000)}
	}
	var buf bytes.Buffer
	hdr, _ := json.Marshal(map[string]any{"event_id": eventID, "sent_at": now.UTC().Format(time.RFC3339)})
	buf.Write(hdr)
	buf.WriteByte('\n')
	buf.WriteString(`{"type":"event"}` + "\n")
	payload, err := json.Marshal(ev)
	if err != nil {
		return nil, err
	}
	buf.Write(payload)
	buf.WriteByte('\n')
	return buf.Bytes(), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	// Cut on a rune boundary.
	for n > 0 && s[n]&0xC0 == 0x80 {
		n--
	}
	return s[:n] + "…"
}

var scrubbers = []struct {
	re   *regexp.Regexp
	repl string
}{
	{regexp.MustCompile(`postgres(ql)?://\S+`), "[dsn]"},
	{regexp.MustCompile(`eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]*`), "[jwt]"},
	{regexp.MustCompile(`(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+`), "Bearer [token]"},
	{regexp.MustCompile(`(?i)(password|passwd|secret|token|authorization|cookie|api[_-]?key|dsn)(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)`), "${1}${2}[redacted]"},
	{regexp.MustCompile(`(?i)[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+`), "[email]"},
	// Long opaque strings: hex or base64 runs that look like keys / hashes
	// ($2a$ bcrypt hashes included).
	{regexp.MustCompile(`\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}`), "[hash]"},
	{regexp.MustCompile(`\b[A-Fa-f0-9]{40,}\b`), "[hex]"},
}

// Scrub removes what must never reach a third party: email addresses, JWTs and
// bearer tokens, password / token / cookie assignments, database URLs and
// long key-like strings. It is applied to every free-text field of an event.
func Scrub(s string) string {
	for _, sc := range scrubbers {
		s = sc.re.ReplaceAllString(s, sc.repl)
	}
	return s
}
