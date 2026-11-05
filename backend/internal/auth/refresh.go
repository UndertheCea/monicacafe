package auth

import "time"

// RefreshReuseGrace is how long after a rotation the immediately previous
// refresh token may still be presented without being treated as theft.
//
// Browsers abort in-flight requests when the user navigates or reloads. If
// that happens during a refresh, the server has already rotated the token but
// the browser never stored the new cookie, so the next page load presents the
// old one. Inside this window that replay rotates again (and revokes the
// successor the browser never received) instead of ending every session.
// The trade-off: a stolen token replayed within the window is not detected.
const RefreshReuseGrace = 20 * time.Second

// RefreshState is what the store knows about a presented refresh token.
type RefreshState struct {
	Found     bool       // a row exists for the token's JTI hash
	ExpiresAt time.Time  // row expiry
	RevokedAt *time.Time // nil while the token is active
	// Rotated is true when the token was revoked by a refresh (it has a
	// successor), false when it was revoked by logout or reuse detection.
	Rotated bool
	// SuccessorActive is true when the token that replaced it is still unused.
	SuccessorActive bool
}

// RefreshDecision is what to do with a presented refresh token.
type RefreshDecision int

const (
	// RefreshInvalid: unknown or expired. Reject without side effects.
	RefreshInvalid RefreshDecision = iota
	// RefreshRotate: active. Revoke it and issue a successor.
	RefreshRotate
	// RefreshGraceReplay: rotated moments ago and the successor was never
	// used. Revoke that successor and issue a new one.
	RefreshGraceReplay
	// RefreshReuse: a rotated token presented again outside the grace window.
	// Someone else holds a copy (possible theft): revoke every session.
	RefreshReuse
)

// ClassifyRefresh decides how to treat a presented refresh token at time now.
func ClassifyRefresh(s RefreshState, now time.Time, grace time.Duration) RefreshDecision {
	if !s.Found || !now.Before(s.ExpiresAt) {
		return RefreshInvalid
	}
	if s.RevokedAt == nil {
		return RefreshRotate
	}
	if !s.Rotated {
		// Revoked on purpose (logout, password change, or an earlier reuse
		// detection): just refuse it. Treating it as theft would also end
		// sessions issued after the revocation, e.g. the one that changed
		// the password, as soon as an old device tried to refresh.
		return RefreshInvalid
	}
	if s.SuccessorActive && now.Sub(*s.RevokedAt) <= grace {
		return RefreshGraceReplay
	}
	return RefreshReuse
}
