package jobs

import (
	"testing"

	"github.com/riverqueue/river"
)

func TestConfigMaxWorkers(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   int
		want int
	}{
		{"zero uses default", 0, DefaultWorkers},
		{"negative uses default", -3, DefaultWorkers},
		{"explicit", 4, 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := Config(tc.in, Workers()).Queues[river.QueueDefault].MaxWorkers
			if got != tc.want {
				t.Fatalf("MaxWorkers = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestNoopKind(t *testing.T) {
	if got := (NoopArgs{}).Kind(); got != "noop" {
		t.Fatalf("Kind = %q", got)
	}
}
