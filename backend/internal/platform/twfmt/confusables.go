package twfmt

import "strings"

// confusables maps Cyrillic and Greek letters that look like Latin ones to the
// Latin letter, keeping case so the camelCase split in asciiWords still works.
// NFKC does not fold these, so "Аdmin" (Cyrillic А) would otherwise slip past
// the reserved-word check (#420).
var confusables = map[rune]rune{
	// Cyrillic upper case
	'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
	'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J', 'Ѕ': 'S',
	// Cyrillic lower case
	'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
	'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w', 'һ': 'h', 'ӏ': 'l',
	// Greek upper case
	'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K',
	'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
	// Greek lower case
	'α': 'a', 'ο': 'o', 'ι': 'i', 'ν': 'v', 'ρ': 'p', 'υ': 'u', 'κ': 'k', 'χ': 'x',
}

// foldConfusables returns s with Cyrillic / Greek look-alikes replaced by
// their Latin letters.
func foldConfusables(s string) string {
	return strings.Map(func(r rune) rune {
		if l, ok := confusables[r]; ok {
			return l
		}
		return r
	}, s)
}
