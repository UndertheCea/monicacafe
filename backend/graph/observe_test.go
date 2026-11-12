package graph_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/underthecea/monicacafe/backend/graph"
)

type recordedOp struct{ name, status string }

type recorder struct {
	mu  sync.Mutex
	ops []recordedOp
}

func (r *recorder) ObserveOperation(name, status string, _ time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ops = append(r.ops, recordedOp{name, status})
}

// TestObserveOperations needs no database: it sends operations that succeed
// without touching it, fail validation, or panic in a resolver (the store is
// nil), and checks the name and status the observer sees.
func TestObserveOperations(t *testing.T) {
	rec := &recorder{}
	srv := graph.NewServer(graph.NewResolver(nil, nil, nil), false)
	srv.Use(graph.ObserveOperations(rec))
	ts := httptest.NewServer(srv)
	defer ts.Close()

	tests := []struct {
		name  string
		query string
		want  recordedOp
	}{
		{"named ok", `query Ping { __typename }`, recordedOp{"Ping", graph.OpStatusOK}},
		{"anonymous ok", `{ __typename }`, recordedOp{"", graph.OpStatusOK}},
		// Rejected before an operation is resolved, so it has no name.
		{"validation error", `query Broken { noSuchField }`, recordedOp{"", graph.OpStatusClientError}},
		{"resolver panic is a server error", `query Boom { coffees { nodes { id } } }`, recordedOp{"Boom", graph.OpStatusServerError}},
	}
	for _, tc := range tests {
		rec.ops = nil
		res, err := http.Post(ts.URL, "application/json", strings.NewReader(`{"query":`+jsonString(tc.query)+`}`))
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if len(rec.ops) != 1 || rec.ops[0] != tc.want {
			t.Errorf("%s: observed %+v, want [%+v] (response %s)", tc.name, rec.ops, tc.want, body)
		}
	}
}

func jsonString(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}
