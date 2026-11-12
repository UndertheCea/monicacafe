package ratelimit

import (
	"testing"
	"time"
)

func TestOnRejectCountsRefusals(t *testing.T) {
	now := time.Unix(0, 0)
	l := newWithClock(Rule{Burst: 2, Per: time.Minute}, func() time.Time { return now })
	n := 0
	l.OnReject(func() { n++ })
	steps := []struct {
		name  string
		do    func() bool
		allow bool
		want  int
	}{
		{"first allowed", func() bool { ok, _ := l.Allow("k"); return ok }, true, 0},
		{"second allowed", func() bool { ok, _ := l.Allow("k"); return ok }, true, 0},
		{"third refused", func() bool { ok, _ := l.Allow("k"); return ok }, false, 1},
		{"check refused", func() bool { ok, _ := l.Check("k"); return ok }, false, 2},
		{"other key allowed", func() bool { ok, _ := l.Allow("other"); return ok }, true, 2},
	}
	for _, s := range steps {
		if got := s.do(); got != s.allow || n != s.want {
			t.Errorf("%s: allowed=%v rejections=%d, want %v / %d", s.name, got, n, s.allow, s.want)
		}
	}
	var nilLimiter *Limiter
	nilLimiter.OnReject(func() { t.Fatal("nil limiter must not call hooks") })
}
