// Package ratelimit is an in-memory, per-key token-bucket limiter used to
// throttle the public auth mutations. It is process-local: with more than one
// API instance each enforces its own budget (move it to Redis when scaling
// out).
package ratelimit

import (
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Rule allows Burst requests at once and refills the bucket completely over
// Per, i.e. a steady rate of Burst/Per. The zero Rule disables limiting.
type Rule struct {
	Burst int
	Per   time.Duration
}

// Enabled reports whether the rule limits anything.
func (r Rule) Enabled() bool { return r.Burst > 0 && r.Per > 0 }

func (r Rule) String() string {
	if !r.Enabled() {
		return "0"
	}
	return fmt.Sprintf("%d/%s", r.Burst, r.Per)
}

// ParseRule parses "N/duration" (e.g. "10/1m", "5/1h"). "" and "0" disable.
func ParseRule(s string) (Rule, error) {
	s = strings.TrimSpace(s)
	if s == "" || s == "0" {
		return Rule{}, nil
	}
	n, d, ok := strings.Cut(s, "/")
	if !ok {
		return Rule{}, fmt.Errorf("ratelimit: %q is not N/duration", s)
	}
	burst, err := strconv.Atoi(strings.TrimSpace(n))
	if err != nil || burst < 1 || burst > 1_000_000 {
		return Rule{}, fmt.Errorf("ratelimit: bad count in %q", s)
	}
	per, err := time.ParseDuration(strings.TrimSpace(d))
	if err != nil || per < time.Second {
		return Rule{}, fmt.Errorf("ratelimit: bad duration in %q (at least 1s)", s)
	}
	return Rule{Burst: burst, Per: per}, nil
}

type bucket struct {
	tokens float64
	last   time.Time
}

// Limiter tracks one bucket per key. A nil *Limiter allows everything.
type Limiter struct {
	rule    Rule
	now     func() time.Time
	mu      sync.Mutex
	buckets map[string]*bucket
	swept   time.Time
}

// New returns a limiter for rule, or nil when the rule is disabled.
func New(rule Rule) *Limiter { return newWithClock(rule, time.Now) }

func newWithClock(rule Rule, now func() time.Time) *Limiter {
	if !rule.Enabled() {
		return nil
	}
	return &Limiter{rule: rule, now: now, buckets: map[string]*bucket{}, swept: now()}
}

// Allow spends one token from key's bucket. When the bucket is empty it
// returns false and how long until a token is available.
func (l *Limiter) Allow(key string) (bool, time.Duration) {
	if l == nil {
		return true, 0
	}
	now := l.now()
	rate := float64(l.rule.Burst) / float64(l.rule.Per) // tokens per nanosecond
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{tokens: float64(l.rule.Burst), last: now}
		l.buckets[key] = b
	}
	if elapsed := now.Sub(b.last); elapsed > 0 {
		b.tokens = min(float64(l.rule.Burst), b.tokens+float64(elapsed)*rate)
	}
	b.last = now
	if b.tokens >= 1 {
		b.tokens--
		return true, 0
	}
	wait := time.Duration((1 - b.tokens) / rate)
	return false, max(wait, time.Second).Round(time.Second)
}

// sweep drops buckets that have refilled completely (indistinguishable from a
// new one), at most once per Per, so memory tracks only recent callers.
func (l *Limiter) sweep(now time.Time) {
	if now.Sub(l.swept) < l.rule.Per {
		return
	}
	l.swept = now
	for k, b := range l.buckets {
		if now.Sub(b.last) >= l.rule.Per {
			delete(l.buckets, k)
		}
	}
}

// Len is the number of tracked keys (for tests and metrics).
func (l *Limiter) Len() int {
	if l == nil {
		return 0
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}
