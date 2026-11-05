package graph

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

// TestErrorCodesMatchFrontend pins the error contract: every Code* constant in
// errors.go must be listed in the frontend's API_ERROR_CODES
// (frontend/lib/errors.ts) and vice versa, so a new code can't ship without
// the UI knowing about it.
func TestErrorCodesMatchFrontend(t *testing.T) {
	f, err := parser.ParseFile(token.NewFileSet(), "errors.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	var backend []string
	for _, d := range f.Decls {
		g, ok := d.(*ast.GenDecl)
		if !ok || g.Tok != token.CONST {
			continue
		}
		for _, spec := range g.Specs {
			vs := spec.(*ast.ValueSpec)
			for i, name := range vs.Names {
				if !strings.HasPrefix(name.Name, "Code") || i >= len(vs.Values) {
					continue
				}
				lit, ok := vs.Values[i].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				v, _ := strconv.Unquote(lit.Value)
				backend = append(backend, v)
			}
		}
	}

	src, err := os.ReadFile("../../frontend/lib/errors.ts")
	if err != nil {
		t.Skipf("frontend source not available: %v", err)
	}
	block := regexp.MustCompile(`(?s)API_ERROR_CODES = \[(.*?)\] as const`).FindSubmatch(src)
	if block == nil {
		t.Fatal("API_ERROR_CODES not found in frontend/lib/errors.ts")
	}
	var frontend []string
	for _, m := range regexp.MustCompile(`"([A-Z_]+)"`).FindAllSubmatch(block[1], -1) {
		frontend = append(frontend, string(m[1]))
	}

	slices.Sort(backend)
	slices.Sort(frontend)
	if len(backend) == 0 || !slices.Equal(backend, frontend) {
		t.Fatalf("error codes drifted:\n backend (graph/errors.go):        %v\n frontend (lib/errors.ts API_ERROR_CODES): %v", backend, frontend)
	}
}
