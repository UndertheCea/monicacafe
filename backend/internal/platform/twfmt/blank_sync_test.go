package twfmt

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"testing"
	"unicode"
)

// TestBlankLookingListedInFrontend keeps the frontend's invisible-character
// check (frontend/lib/textInput.ts REFUSED_CHAR) in step with isBlankLooking,
// so forms name the cause of every refusal the API makes (#502). Cc / Cf runes
// are matched there by category, so only the extra letters need listing.
func TestBlankLookingListedInFrontend(t *testing.T) {
	src, err := os.ReadFile("../../../../frontend/lib/textInput.ts")
	if err != nil {
		t.Fatalf("read frontend/lib/textInput.ts: %v", err)
	}
	m := regexp.MustCompile(`const REFUSED_CHAR = /\[([^\]]*)\]/u;`).FindSubmatch(src)
	if m == nil {
		t.Fatal("REFUSED_CHAR not found in frontend/lib/textInput.ts")
	}
	class := strings.ToUpper(string(m[1]))
	checked := 0
	for r := rune(0); r <= unicode.MaxRune; r++ {
		if !isBlankLooking(r) || unicode.Is(unicode.Cc, r) || unicode.Is(unicode.Cf, r) {
			continue
		}
		checked++
		if want := fmt.Sprintf(`\U%04X`, r); !strings.Contains(class, want) {
			t.Errorf("isBlankLooking refuses U+%04X but frontend REFUSED_CHAR doesn't list %s", r, want)
		}
	}
	if checked == 0 {
		t.Fatal("isBlankLooking matched no rune")
	}
}
