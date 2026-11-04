package store

import (
	"math"
	"testing"
)

func TestPinCoords(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	tests := []struct {
		name     string
		lat, lng *float64
		wantOK   bool
	}{
		{"taipei", f(25.0330), f(121.5654), true},
		{"southern hemisphere", f(-33.86), f(151.21), true},
		{"bounds inclusive", f(90), f(-180), true},
		{"both nil", nil, nil, false},
		{"lat only", f(25), nil, false},
		{"lng only", nil, f(121), false},
		{"lat too big", f(90.1), f(121), false},
		{"lng too small", f(25), f(-180.5), false},
		{"null island", f(0), f(0), false},
		{"NaN", f(math.NaN()), f(121), false},
		{"Inf", f(25), f(math.Inf(1)), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lat, lng := PinCoords(tt.lat, tt.lng)
			if tt.wantOK {
				if lat == nil || lng == nil || *lat != *tt.lat || *lng != *tt.lng {
					t.Fatalf("PinCoords = (%v, %v), want input unchanged", lat, lng)
				}
				return
			}
			if lat != nil || lng != nil {
				t.Fatalf("PinCoords = (%v, %v), want (nil, nil)", lat, lng)
			}
		})
	}
}
