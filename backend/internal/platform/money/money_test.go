package money

import (
	"encoding/json"
	"math"
	"testing"
)

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

func TestUnmarshalGQL(t *testing.T) {
	tests := []struct {
		name string
		in   any
		want TWD
		ok   bool
	}{
		{"int", 450, 450, true},
		{"int64", int64(1200), 1200, true},
		{"int32", int32(99), 99, true},
		{"zero", 0, 0, true},
		{"whole float", 450.0, 450, true},
		{"max", int64(Max), Max, true},
		{"json number", json.Number("380"), 380, true},
		{"numeric string", "380", 380, true},
		{"fraction", 12.7, 0, false},
		{"tiny fraction", 450.0000001, 0, false},
		{"negative int", -1, 0, false},
		{"negative float", -5.0, 0, false},
		{"above max", int64(Max) + 1, 0, false},
		{"huge float", 1e19, 0, false},
		{"NaN", math.NaN(), 0, false},
		{"Inf", math.Inf(1), 0, false},
		{"fraction json number", json.Number("12.5"), 0, false},
		{"word", "twelve", 0, false},
		{"bool", true, 0, false},
		{"nil", nil, 0, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := TWD(-7)
			err := got.UnmarshalGQL(tc.in)
			if tc.ok {
				if err != nil || got != tc.want {
					t.Fatalf("got %v, %v; want %v", got, err, tc.want)
				}
				return
			}
			if err == nil {
				t.Fatalf("accepted %v as %v", tc.in, got)
			}
			if got != -7 {
				t.Fatalf("modified on error: %v", got)
			}
		})
	}
}
