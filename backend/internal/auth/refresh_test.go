package auth

import (
	"testing"
	"time"
)

func TestClassifyRefresh(t *testing.T) {
	now := time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)
	future := now.Add(time.Hour)
	ago := func(d time.Duration) *time.Time { t := now.Add(-d); return &t }

	tests := []struct {
		name  string
		state RefreshState
		want  RefreshDecision
	}{
		{"unknown token", RefreshState{}, RefreshInvalid},
		{"expired token", RefreshState{Found: true, ExpiresAt: now}, RefreshInvalid},
		{"expired even if revoked", RefreshState{Found: true, ExpiresAt: now.Add(-time.Second), RevokedAt: ago(time.Second), Rotated: true, SuccessorActive: true}, RefreshInvalid},
		{"active token rotates", RefreshState{Found: true, ExpiresAt: future}, RefreshRotate},
		{"replay right after rotation", RefreshState{Found: true, ExpiresAt: future, RevokedAt: ago(2 * time.Second), Rotated: true, SuccessorActive: true}, RefreshGraceReplay},
		{"replay at the window edge", RefreshState{Found: true, ExpiresAt: future, RevokedAt: ago(RefreshReuseGrace), Rotated: true, SuccessorActive: true}, RefreshGraceReplay},
		{"replay after the window", RefreshState{Found: true, ExpiresAt: future, RevokedAt: ago(RefreshReuseGrace + time.Second), Rotated: true, SuccessorActive: true}, RefreshReuse},
		{"successor already used", RefreshState{Found: true, ExpiresAt: future, RevokedAt: ago(time.Second), Rotated: true, SuccessorActive: false}, RefreshReuse},
		{"revoked by logout", RefreshState{Found: true, ExpiresAt: future, RevokedAt: ago(time.Second)}, RefreshReuse},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClassifyRefresh(tt.state, now, RefreshReuseGrace); got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}
