// Package twfmt validates Taiwan-specific formats. Stdlib only.
package twfmt

import "regexp"

var (
	mobile   = regexp.MustCompile(`^09\d{8}$`)
	postal3  = regexp.MustCompile(`^\d{3}(\d{2,3})?$`)
	taxID    = regexp.MustCompile(`^\d{8}$`)
	cvsStore = regexp.MustCompile(`^\d{6}$`)
)

// IsMobile reports whether s is a Taiwan mobile number like 0912345678.
func IsMobile(s string) bool { return mobile.MatchString(s) }

// IsPostalCode reports whether s is a 3-, 5- or 6-digit Taiwan postal code.
func IsPostalCode(s string) bool { return postal3.MatchString(s) && len(s) != 4 }

// IsCVSStoreID reports whether s looks like a 6-digit 7-ELEVEN/FamilyMart store id.
func IsCVSStoreID(s string) bool { return cvsStore.MatchString(s) }

// IsTaxID validates a 統一編號 (8 digits) with the checksum rule.
func IsTaxID(s string) bool {
	if !taxID.MatchString(s) {
		return false
	}
	w := [8]int{1, 2, 1, 2, 1, 2, 4, 1}
	sum := 0
	for i := 0; i < 8; i++ {
		p := int(s[i]-'0') * w[i]
		sum += p/10 + p%10
	}
	return sum%5 == 0 || (s[6] == '7' && (sum+1)%5 == 0)
}
