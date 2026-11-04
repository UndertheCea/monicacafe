package auth

import (
	"errors"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	// MinPasswordLen is the minimum password length in characters.
	MinPasswordLen = 8
	// maxPasswordBytes is bcrypt's input limit.
	maxPasswordBytes = 72
)

// ErrWeakPassword is returned when a password fails length requirements.
var ErrWeakPassword = errors.New("password must be 8–72 bytes long")

// ValidatePassword checks password length constraints.
func ValidatePassword(pw string) error {
	if utf8.RuneCountInString(pw) < MinPasswordLen || len(pw) > maxPasswordBytes {
		return ErrWeakPassword
	}
	return nil
}

// HashPassword returns a bcrypt hash of pw.
func HashPassword(pw string) (string, error) {
	if err := ValidatePassword(pw); err != nil {
		return "", err
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// CheckPassword reports whether pw matches the bcrypt hash.
func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// dummyHash is compared against when a login email is unknown so that
// response timing does not reveal which emails are registered.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("moni-cafe-timing-equaliser"), bcrypt.DefaultCost)

// EqualiseTiming performs a throwaway bcrypt comparison.
func EqualiseTiming(pw string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(pw))
}
