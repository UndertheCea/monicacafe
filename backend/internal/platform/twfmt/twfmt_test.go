package twfmt

import "testing"

func TestTwfmt(t *testing.T) {
	if !IsMobile("0912345678") || IsMobile("0212345678") || IsMobile("091234567") {
		t.Fatal("mobile")
	}
	if !IsPostalCode("100") || !IsPostalCode("10058") || !IsPostalCode("100583") || IsPostalCode("1005") {
		t.Fatal("postal")
	}
	if !IsCVSStoreID("131386") || IsCVSStoreID("1313") {
		t.Fatal("cvs")
	}
	if !IsTaxID("04595257") || IsTaxID("04595258") || IsTaxID("1234") {
		t.Fatal("taxid")
	}
}
