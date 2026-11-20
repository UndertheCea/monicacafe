package twfmt

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// reservedNames are platform and staff words no display name may contain, so
// nobody can comment as "Moni Cafe 客服" or "Admin" (#286). They match anywhere
// in the NFKC-folded, lower-cased name with everything but letters and digits
// removed ("M.o.n.i Cafe" too).
var reservedNames = []string{"monicafe", "monicacafe", "客服", "管理員", "管理者", "官方"}

// reservedWords are English staff words. They match only as whole words (#396):
// as substrings they refused "Badminton Lover", "Stafford" and "Unofficial Joe".
// Words are runs of ASCII letters, split at a lower → upper case change
// ("TheAdmin"), and runs of single letters are joined ("a d m i n"). A plural
// "s" counts as the word.
var reservedWords = []string{"admin", "administrator", "moderator", "official", "support", "staff"}

// IsReservedDisplayName reports whether name contains a reserved platform or
// staff word, ignoring case, spacing, punctuation and full-width forms.
func IsReservedDisplayName(name string) bool {
	nfkc := foldConfusables(norm.NFKC.String(name))
	var b strings.Builder
	for _, r := range nfkc {
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
	for _, tok := range asciiWords(nfkc) {
		for _, w := range reservedWords {
			if tok == w || tok == w+"s" {
				return true
			}
		}
	}
	return false
}

// asciiWords splits s into lower-cased words of ASCII letters (see reservedWords).
func asciiWords(s string) []string {
	var raw []string
	var cur []rune
	flush := func() {
		if len(cur) > 0 {
			raw = append(raw, strings.ToLower(string(cur)))
			cur = cur[:0]
		}
	}
	prevLower := false
	for _, r := range s {
		isUpper, isLower := r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z'
		switch {
		case isUpper && prevLower:
			flush()
			cur = append(cur, r)
		case isUpper || isLower:
			cur = append(cur, r)
		default:
			flush()
		}
		prevLower = isLower
	}
	flush()
	// Join runs of single letters: "a d m i n" → "admin".
	var words []string
	var single strings.Builder
	for _, w := range raw {
		if len(w) == 1 {
			single.WriteString(w)
			continue
		}
		if single.Len() > 0 {
			words = append(words, single.String())
			single.Reset()
		}
		words = append(words, w)
	}
	if single.Len() > 0 {
		words = append(words, single.String())
	}
	return words
}
