package auth

import (
	_ "embed"
	"errors"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	// MinPasswordLen is the minimum password length in characters.
	MinPasswordLen = 8
	// maxPasswordBytes is bcrypt's input limit.
	maxPasswordBytes = 72
	// BcryptCost is the work factor for new hashes (#213). Hashes made at a
	// lower cost are upgraded on the next successful login (NeedsRehash).
	BcryptCost = 12
)

// ErrWeakPassword is returned when a password fails length requirements.
var ErrWeakPassword = errors.New("password must be 8–72 bytes long")

// ErrCommonPassword is returned for a password on the common-password list.
var ErrCommonPassword = errors.New("password is too common")

//go:embed common_passwords.txt
var commonPasswordsTxt string

// commonPasswords holds the 1,000 most common passwords that are long enough
// to pass the length rule, lower-cased (#213).
var commonPasswords = func() map[string]struct{} {
	m := make(map[string]struct{}, 1000)
	for _, line := range strings.Split(commonPasswordsTxt, "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			m[line] = struct{}{}
		}
	}
	return m
}()

// IsCommonPassword reports whether pw (case-insensitively, ignoring
// surrounding spaces) is on the common-password list.
func IsCommonPassword(pw string) bool {
	_, ok := commonPasswords[strings.ToLower(strings.TrimSpace(pw))]
	return ok
}

// ValidatePassword checks a new password: 8–72 bytes and not a common one.
func ValidatePassword(pw string) error {
	if utf8.RuneCountInString(pw) < MinPasswordLen || len(pw) > maxPasswordBytes {
		return ErrWeakPassword
	}
	if IsCommonPassword(pw) {
		return ErrCommonPassword
	}
	return nil
}

// HashPassword validates pw as a new password and returns its bcrypt hash.
func HashPassword(pw string) (string, error) {
	if err := ValidatePassword(pw); err != nil {
		return "", err
	}
	return hash(pw)
}

// Rehash returns a hash of an existing, already verified password at the
// current cost. It skips ValidatePassword: a password chosen before a rule
// existed still has to work.
func Rehash(pw string) (string, error) { return hash(pw) }

func hash(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// NeedsRehash reports whether hash was made at a lower cost than BcryptCost.
func NeedsRehash(hash string) bool {
	cost, err := bcrypt.Cost([]byte(hash))
	return err == nil && cost < BcryptCost
}

// CheckPassword reports whether pw matches the bcrypt hash.
func CheckPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// dummyHash is compared against when a login email is unknown so that
// response timing does not reveal which emails are registered. Same cost as
// real hashes, or the timing would differ.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("moni-cafe-timing-equaliser"), BcryptCost)

// EqualiseTiming performs a throwaway bcrypt comparison.
func EqualiseTiming(pw string) {
	_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(pw))
}
