package twfmt

import "testing"

func TestIsReservedDisplayName(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"Admin", true},
		{"ＡＤＭＩＮ", true},
		{"a d m i n", true},
		{"Moni Cafe 客服", true},
		{"monicafe", true},
		{"MoniCafe_Official", true},
		{"管理員小明", true},
		{"官方帳號", true},
		{"Support Team", true},
		{"Site-Staff", true},
		{"Moderator", true},
		{"小明", false},
		{"Coffee Lover", false},
		{"手沖愛好者", false},
		{"Moni", false},
	}
	for _, tc := range tests {
		if got := IsReservedDisplayName(tc.in); got != tc.want {
			t.Errorf("IsReservedDisplayName(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestHasBlankLookingRune(t *testing.T) {
	for _, tc := range []struct {
		in   string
		want bool
	}{{"ㅤ", true}, {"a⠀b", true}, {"ᅟ", true}, {"ᅠ", true}, {"ﾠ", true}, {"小明", false}, {"Moni", false}} {
		if got := HasBlankLookingRune(tc.in); got != tc.want {
			t.Errorf("HasBlankLookingRune(%q) = %v", tc.in, got)
		}
	}
}
