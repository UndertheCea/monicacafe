package twfmt

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// reservedNames are platform and staff words no display name may contain, so
// nobody can comment as "Moni Cafe 客服" or "Admin" (#286). Matching is on the
// NFKC-folded, lower-cased name with everything but letters and digits removed.
var reservedNames = []string{
	"monicafe", "monicacafe", "客服", "管理員", "管理者", "admin", "administrator",
	"moderator", "official", "官方", "support", "staff",
}

// IsReservedDisplayName reports whether name contains a reserved platform or
// staff word, ignoring case, spacing, punctuation and full-width forms.
func IsReservedDisplayName(name string) bool {
	var b strings.Builder
	for _, r := range norm.NFKC.String(name) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(unicode.ToLower(r))
		}
	}
	folded := b.String()
	for _, w := range reservedNames {
		if strings.Contains(folded, w) {
			return true
		}
	}
	return false
}
