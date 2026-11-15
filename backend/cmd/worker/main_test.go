package main

import "testing"

func TestIsHealthCmd(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want bool
	}{
		{"no args runs the worker", nil, false},
		{"health", []string{"health"}, true},
		{"other word", []string{"run"}, false},
		{"extra args", []string{"health", "x"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isHealthCmd(tt.args); got != tt.want {
				t.Errorf("isHealthCmd(%v) = %v, want %v", tt.args, got, tt.want)
			}
		})
	}
}
