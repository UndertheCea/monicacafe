package tz

import (
	"testing"
	"time"
)

func TestToTaipei(t *testing.T) {
	u := time.Date(2026, 10, 6, 20, 0, 0, 0, time.UTC)
	if got := ToTaipei(u); got.Day() != 7 || got.Hour() != 4 {
		t.Fatal(got)
	}
}
