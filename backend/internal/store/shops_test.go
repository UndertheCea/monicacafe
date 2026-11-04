package store

import "testing"

func TestPinnable(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name     string
		lat, lng *float64
		want     bool
	}{
		{"taipei", f(25.0330), f(121.5654), true},
		{"origin", f(0), f(0), true},
		{"bounds inclusive", f(-90), f(180), true},
		{"no lat", nil, f(121.5), false},
		{"no lng", f(25), nil, false},
		{"neither", nil, nil, false},
		{"lat too high", f(90.0001), f(121), false},
		{"lat too low", f(-91), f(121), false},
		{"lng too high", f(25), f(180.5), false},
		{"lng too low", f(25), f(-181), false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Pinnable(tc.lat, tc.lng); got != tc.want {
				t.Errorf("Pinnable() = %v, want %v", got, tc.want)
			}
		})
	}
}
