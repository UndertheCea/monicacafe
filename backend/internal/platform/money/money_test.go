package money

import "testing"

func TestString(t *testing.T) {
	if got := TWD(450).String(); got != "NT$450" {
		t.Fatal(got)
	}
}

func TestAddOverflow(t *testing.T) {
	if _, err := TWD(1<<63 - 1).Add(1); err == nil {
		t.Fatal("expected overflow")
	}
	if s, _ := TWD(100).Add(50); s != 150 {
		t.Fatal(s)
	}
}
