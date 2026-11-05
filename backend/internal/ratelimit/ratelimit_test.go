package ratelimit

import (
	"testing"
	"time"
)

func TestParseRule(t *testing.T) {
	cases := []struct {
		in      string
		want    Rule
		wantErr bool
	}{
		{"", Rule{}, false},
		{"0", Rule{}, false},
		{"10/1m", Rule{Burst: 10, Per: time.Minute}, false},
		{" 5 / 1h ", Rule{Burst: 5, Per: time.Hour}, false},
		{"10", Rule{}, true},
		{"x/1m", Rule{}, true},
		{"0/1m", Rule{}, true},
		{"-1/1m", Rule{}, true},
		{"10/soon", Rule{}, true},
		{"10/100ms", Rule{}, true},
	}
	for _, c := range cases {
		got, err := ParseRule(c.in)
		if (err != nil) != c.wantErr || got != c.want {
			t.Errorf("ParseRule(%q) = %v, %v; want %v, err=%v", c.in, got, err, c.want, c.wantErr)
		}
	}
}

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

func TestLimiterAllow(t *testing.T) {
	type step struct {
		advance   time.Duration
		key       string
		wantOK    bool
		wantRetry time.Duration
	}
	cases := []struct {
		name  string
		rule  Rule
		steps []step
	}{
		{
			name: "burst then refused, refills at Burst/Per",
			rule: Rule{Burst: 3, Per: time.Minute}, // one token per 20 s
			steps: []step{
				{0, "a", true, 0}, {0, "a", true, 0}, {0, "a", true, 0},
				{0, "a", false, 20 * time.Second},
				{10 * time.Second, "a", false, 10 * time.Second},
				{10 * time.Second, "a", true, 0},
				{0, "a", false, 20 * time.Second},
			},
		},
		{
			name: "keys are independent",
			rule: Rule{Burst: 1, Per: time.Hour},
			steps: []step{
				{0, "a", true, 0}, {0, "a", false, time.Hour},
				{0, "b", true, 0}, {0, "b", false, time.Hour},
			},
		},
		{
			name: "refill caps at burst",
			rule: Rule{Burst: 2, Per: time.Minute},
			steps: []step{
				{0, "a", true, 0},
				{24 * time.Hour, "a", true, 0}, {0, "a", true, 0}, {0, "a", false, 30 * time.Second},
			},
		},
		{
			name: "retry-after is at least a second",
			rule: Rule{Burst: 100, Per: time.Second},
			steps: func() []step {
				s := make([]step, 0, 101)
				for range 100 {
					s = append(s, step{0, "a", true, 0})
				}
				return append(s, step{0, "a", false, time.Second})
			}(),
		},
	}
	for _, c := range cases {
		clk := &fakeClock{t: time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)}
		l := newWithClock(c.rule, clk.now)
		for i, s := range c.steps {
			clk.advance(s.advance)
			ok, retry := l.Allow(s.key)
			if ok != s.wantOK || retry != s.wantRetry {
				t.Fatalf("%s: step %d: Allow(%q) = %v, %v; want %v, %v", c.name, i, s.key, ok, retry, s.wantOK, s.wantRetry)
			}
		}
	}
}

func TestNilAndDisabledLimiterAllows(t *testing.T) {
	var l *Limiter
	if ok, _ := l.Allow("x"); !ok {
		t.Fatal("nil limiter refused")
	}
	if New(Rule{}) != nil {
		t.Fatal("disabled rule should give a nil limiter")
	}
}

func TestSweepDropsRefilledBuckets(t *testing.T) {
	clk := &fakeClock{t: time.Unix(0, 0)}
	l := newWithClock(Rule{Burst: 1, Per: time.Minute}, clk.now)
	l.Allow("a")
	l.Allow("b")
	clk.advance(30 * time.Second)
	l.Allow("c")
	if l.Len() != 3 {
		t.Fatalf("Len = %d, want 3", l.Len())
	}
	clk.advance(40 * time.Second) // a and b idle 70 s ≥ Per; c idle 40 s
	l.Allow("d")
	if l.Len() != 2 {
		t.Fatalf("after sweep Len = %d, want 2 (c, d)", l.Len())
	}
}
