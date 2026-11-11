package auth

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"time"
)

func TestAccessTokenRoundTrip(t *testing.T) {
	s := NewService("a-secret", "r-secret")
	tok, err := s.IssueAccessToken("user-1", "SELLER")
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.ParseAccessToken(tok)
	if err != nil {
		t.Fatal(err)
	}
	if c.UserID != "user-1" || c.Role != "SELLER" {
		t.Fatalf("unexpected claims: %+v", c)
	}
}

func TestTokensAreNotInterchangeable(t *testing.T) {
	s := NewService("a-secret", "r-secret")
	access, _ := s.IssueAccessToken("u", "BUYER")
	refresh, err := s.IssueRefreshToken("u")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ParseRefreshToken(access); err == nil {
		t.Fatal("access token accepted as refresh token")
	}
	if _, err := s.ParseAccessToken(refresh.Token); err == nil {
		t.Fatal("refresh token accepted as access token")
	}
}

func TestRefreshTokenCarriesHashedJTI(t *testing.T) {
	s := NewService("a", "r")
	rt, err := s.IssueRefreshToken("u")
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.ParseRefreshToken(rt.Token)
	if err != nil {
		t.Fatal(err)
	}
	if HashJTI(c.ID) != rt.JTIHash {
		t.Fatal("JTI hash mismatch")
	}
	rt2, _ := s.IssueRefreshToken("u")
	if rt2.JTIHash == rt.JTIHash {
		t.Fatal("JTIs must be unique")
	}
}

func TestExpiredTokenRejected(t *testing.T) {
	s := NewService("a", "r")
	s.now = func() time.Time { return time.Now().Add(-time.Hour) }
	tok, _ := s.IssueAccessToken("u", "BUYER")
	s.now = time.Now
	if _, err := s.ParseAccessToken(tok); err == nil {
		t.Fatal("expired token accepted")
	}
}

func TestWrongSecretRejected(t *testing.T) {
	tok, _ := NewService("a", "r").IssueAccessToken("u", "BUYER")
	if _, err := NewService("other", "r").ParseAccessToken(tok); err == nil {
		t.Fatal("token signed with a different secret accepted")
	}
}

func TestPasswords(t *testing.T) {
	if _, err := HashPassword("short"); err != ErrWeakPassword {
		t.Fatalf("expected ErrWeakPassword, got %v", err)
	}
	if _, err := HashPassword(strings.Repeat("x", 73)); err != ErrWeakPassword {
		t.Fatalf("expected ErrWeakPassword for >72 bytes, got %v", err)
	}
	h, err := HashPassword("咖啡好好喝coffee")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "咖啡好好喝coffee") {
		t.Fatal("correct password rejected")
	}
	if CheckPassword(h, "wrong-password") {
		t.Fatal("wrong password accepted")
	}
}

func TestValidatePasswordCommon(t *testing.T) {
	cases := []struct {
		pw   string
		want error
	}{
		{"password", ErrCommonPassword},
		{"PassWord", ErrCommonPassword},
		{" 12345678 ", ErrCommonPassword},
		{"iloveyou", ErrCommonPassword},
		{"short", ErrWeakPassword},
		{"correct-horse-battery", nil},
		{"咖啡好好喝coffee", nil},
	}
	for _, c := range cases {
		if got := ValidatePassword(c.pw); got != c.want {
			t.Errorf("ValidatePassword(%q) = %v, want %v", c.pw, got, c.want)
		}
	}
	if len(commonPasswords) < 900 {
		t.Fatalf("common password list has %d entries", len(commonPasswords))
	}
	for pw := range commonPasswords {
		if len([]rune(pw)) < MinPasswordLen {
			t.Fatalf("%q is shorter than the length rule; the list should only hold passwords it doesn't already reject", pw)
		}
	}
}

func TestNeedsRehash(t *testing.T) {
	old, _ := bcrypt.GenerateFromPassword([]byte("correct-horse-battery"), bcrypt.MinCost)
	cur, _ := Rehash("correct-horse-battery")
	cases := []struct {
		name, hash string
		want       bool
	}{
		{"lower cost", string(old), true},
		{"current cost", cur, false},
		{"not a hash", "nope", false},
	}
	for _, c := range cases {
		if got := NeedsRehash(c.hash); got != c.want {
			t.Errorf("%s: NeedsRehash = %v, want %v", c.name, got, c.want)
		}
	}
	if !CheckPassword(cur, "correct-horse-battery") {
		t.Fatal("rehashed password doesn't verify")
	}
	if h, err := Rehash("password"); err != nil || !CheckPassword(h, "password") {
		t.Fatal("Rehash must accept an existing common password")
	}
}
