package graph

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/complexity"
	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/underthecea/monicacafe/backend/graph/generated"
)

func limitedSchema() (*queryLimits, *ast.Schema) {
	es := generated.NewExecutableSchema(generated.Config{Complexity: complexityRoot()})
	q := &queryLimits{maxComplexity: MaxQueryComplexity, maxDepth: MaxQueryDepth}
	_ = q.Validate(es)
	return q, es.Schema()
}

func TestQueryShapeAndCost(t *testing.T) {
	q, schema := limitedSchema()
	tests := []struct {
		name          string
		query         string
		vars          map[string]any
		depth         int
		nestedSimilar bool
		cost          int // 0 = don't check the exact cost
		refused       bool
	}{
		{name: "one field", query: `{ shopsForMap { id } }`, depth: 2, cost: 2},
		{name: "list cost follows the limit", query: `{ coffees(limit: 10) { nodes { id name } } }`, depth: 3, cost: 1 + 10*(1+2)},
		{name: "default page size is priced", query: `{ coffees { nodes { id } } }`, depth: 3, cost: 1 + 20*2},
		{name: "limit above the maximum is clamped like the resolver", query: `{ coffees(limit: 100000) { nodes { id } } }`, depth: 3, cost: 1 + 100*2},
		{name: "limit from a variable", query: `query($n: Int) { coffees(limit: $n) { nodes { id } } }`, vars: map[string]any{"n": int64(50)}, depth: 3, cost: 1 + 50*2},
		{name: "similar prices its scan", query: `query { coffee(id: "x") { similar(limit: 4) { id } } }`, depth: 3, cost: 1 + similarQueryCost + 4},
		{name: "fragments are followed", query: `{ coffees(limit: 2) { nodes { ...C } } } fragment C on Coffee { id ... on Coffee { shop { name } } }`, depth: 4, cost: 1 + 2*(1+1+2)},
		{
			name:  "the issue's query: similar of similar of similar across 100 coffees",
			query: `{ coffees(limit:100) { nodes { similar(limit:12) { similar(limit:12) { similar(limit:12) { id } } } } } }`,
			depth: 6, nestedSimilar: true, refused: true,
		},
		{
			name:  "nested similar through a fragment",
			query: `{ coffee(id: "x") { similar { ...S } } } fragment S on Coffee { shop { coffees { nodes { similar { id } } } } }`,
			depth: 7, nestedSimilar: true, refused: true,
		},
		{
			name:    "similar for a whole page of coffees",
			query:   `{ coffees(limit: 100) { nodes { similar(limit: 1) { id } } } }`,
			depth:   4,
			cost:    1 + 100*(1+similarQueryCost+1),
			refused: true,
		},
		{
			name:    "the issue's query: comments of coffees of comments",
			query:   `query { coffee(id: "x") { comments(limit:100) { coffee { comments(limit:100) { coffee { comments(limit:100) { id } } } } } } }`,
			depth:   7,
			refused: true,
		},
		{
			name:    "too deep, though cheap",
			query:   `query { coffee(id: "x") { shop { coffees(limit:1) { nodes { shop { coffees(limit:1) { nodes { shop { coffees(limit:1) { nodes { id } } } } } } } } } } }`,
			depth:   11,
			refused: true,
		},
		{name: "a field merely named similar elsewhere isn't Coffee.similar", query: `{ similar: shopsForMap { similar: id } }`, depth: 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, errs := gqlparser.LoadQuery(schema, tt.query)
			if errs != nil {
				t.Fatalf("query doesn't validate: %v", errs)
			}
			op := doc.Operations[0]
			shape := shapeOf(op.SelectionSet)
			if shape.depth != tt.depth || shape.nestedSimilar != tt.nestedSimilar {
				t.Errorf("shape = %+v, want depth %d nestedSimilar %v", shape, tt.depth, tt.nestedSimilar)
			}
			cost := complexity.Calculate(context.Background(), q.es, op, tt.vars)
			if tt.cost != 0 && cost != tt.cost {
				t.Errorf("cost = %d, want %d", cost, tt.cost)
			}
			refused := shape.depth > MaxQueryDepth || shape.nestedSimilar || cost > MaxQueryComplexity
			if refused != tt.refused {
				t.Errorf("refused = %v, want %v (depth %d, nested similar %v, cost %d)", refused, tt.refused, shape.depth, shape.nestedSimilar, cost)
			}
		})
	}
}

func TestTooManyTokens(t *testing.T) {
	tests := []struct {
		query string
		limit int
		want  bool
	}{
		{"{ a }", 3, false},
		{"{ a b }", 3, true},
		{"", 0, false},
		{"{ a # a comment isn't a token\n }", 3, false},
		{`{ a(x: "one string, one token") }`, 8, false},
		{`{ a(x: "one string, one token") }`, 7, true},
		{`{ "unterminated`, 1, false}, // a lexing error is the parser's to report
	}
	for _, tt := range tests {
		if got := tooManyTokens(tt.query, tt.limit); got != tt.want {
			t.Errorf("tooManyTokens(%q, %d) = %v, want %v", tt.query, tt.limit, got, tt.want)
		}
	}
}

func TestIntrospectionIsNotCountedForDepth(t *testing.T) {
	_, schema := limitedSchema()
	doc, errs := gqlparser.LoadQuery(schema, `{ __schema { types { fields { type { ofType { ofType { ofType { ofType { ofType { name } } } } } } } } } shopsForMap { id } }`)
	if errs != nil {
		t.Fatal(errs)
	}
	if got := shapeOf(doc.Operations[0].SelectionSet).depth; got != 2 {
		t.Fatalf("depth = %d, want 2 (only shopsForMap { id } counts)", got)
	}
}

// frontendOperations collects every GraphQL operation in the frontend's
// source: template literals that start with `query` or `mutation`, with their
// ${CONSTANT} parts filled in from the string and number constants found in
// the same tree.
func frontendOperations(t *testing.T) map[string]string {
	t.Helper()
	root := "../../frontend"
	if _, err := os.Stat(filepath.Join(root, "lib", "api.ts")); err != nil {
		t.Skipf("frontend source not available: %v", err)
	}
	var (
		literal  = regexp.MustCompile("(?s)`([^`]*)`")
		strConst = regexp.MustCompile("(?s)const\\s+(\\w+)\\s*=\\s*(?:`([^`]*)`|\"([^\"\\n]*)\")")
		numConst = regexp.MustCompile(`const\s+(\w+)\s*=\s*(\d+)\s*;`)
		hole     = regexp.MustCompile(`\$\{(\w+)\}`)
		opStart  = regexp.MustCompile(`^(query|mutation)\b`)
		opName   = regexp.MustCompile(`^(?:query|mutation)\s+(\w+)`)
	)
	consts := map[string]string{}
	var docs []struct{ file, text string }
	for _, dir := range []string{"app", "components", "lib"} {
		err := filepath.WalkDir(filepath.Join(root, dir), func(path string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() || !(strings.HasSuffix(path, ".ts") || strings.HasSuffix(path, ".tsx")) {
				return err
			}
			raw, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			src := string(raw)
			for _, m := range strConst.FindAllStringSubmatch(src, -1) {
				consts[m[1]] = m[2] + m[3]
			}
			for _, m := range numConst.FindAllStringSubmatch(src, -1) {
				// The same name in two files (PAGE_SIZE): keep the larger, the worse case.
				n, _ := strconv.Atoi(m[2])
				if old, err := strconv.Atoi(consts[m[1]]); err != nil || n > old {
					consts[m[1]] = m[2]
				}
			}
			for _, m := range literal.FindAllStringSubmatch(src, -1) {
				if text := strings.TrimSpace(m[1]); opStart.MatchString(text) {
					docs = append(docs, struct{ file, text string }{path, text})
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	ops := map[string]string{}
	for _, d := range docs {
		text := d.text
		for i := 0; i < 5 && hole.MatchString(text); i++ {
			text = hole.ReplaceAllStringFunc(text, func(h string) string {
				name := hole.FindStringSubmatch(h)[1]
				v, ok := consts[name]
				if !ok {
					t.Fatalf("%s: can't resolve ${%s} in a GraphQL document", d.file, name)
				}
				return v
			})
		}
		name := d.file
		if m := opName.FindStringSubmatch(text); m != nil {
			name = m[1]
		}
		ops[name+" ("+strings.TrimPrefix(d.file, root+"/")+")"] = text
	}
	return ops
}

// Every operation the site sends must pass the request limits, even with every
// page-size variable at the API's maximum (100), so a limit can't be tightened
// (or a query grown) into breaking a page. Costs are logged with -v.
func TestFrontendOperationsFitTheLimits(t *testing.T) {
	q, schema := limitedSchema()
	ops := frontendOperations(t)
	if len(ops) < 40 {
		t.Fatalf("found only %d operations in the frontend; the extractor no longer matches the source", len(ops))
	}
	worst, worstName := 0, ""
	for name, text := range ops {
		doc, errs := gqlparser.LoadQuery(schema, text)
		if errs != nil {
			t.Errorf("%s: doesn't validate against the schema: %v", name, errs)
			continue
		}
		for _, op := range doc.Operations {
			vars := map[string]any{}
			for _, v := range op.VariableDefinitions {
				if v.Type.NamedType == "Int" {
					vars[v.Variable] = int64(maxPageSize)
				}
			}
			shape := shapeOf(op.SelectionSet)
			cost := complexity.Calculate(context.Background(), q.es, op, vars)
			t.Logf("%-70s depth %d cost %d", name, shape.depth, cost)
			if cost > worst {
				worst, worstName = cost, name
			}
			if shape.depth > MaxQueryDepth || shape.nestedSimilar || cost > MaxQueryComplexity {
				t.Errorf("%s would be refused: depth %d (max %d), nested similar %v, cost %d (max %d)",
					name, shape.depth, MaxQueryDepth, shape.nestedSimilar, cost, MaxQueryComplexity)
			}
		}
	}
	t.Logf("most expensive: %s at %d of %d", worstName, worst, MaxQueryComplexity)
}

// Newer gqlgen reports the parser's token cut-off as GRAPHQL_PARSE_FAILED; the
// API keeps answering QUERY_TOO_COMPLEX for it, and only for it (#261).
func TestTokenLimitErrorIsQueryTooComplex(t *testing.T) {
	parse := func(msg string) *gqlerror.Error {
		return &gqlerror.Error{Message: msg, Extensions: map[string]any{"code": errcode.ParseFailed}}
	}
	tests := []struct {
		name string
		err  *gqlerror.Error
		want string
	}{
		{"token limit", parse("exceeded token limit of 5000"), CodeQueryTooComplex},
		{"other parse error", parse("Expected Name, found <EOF>"), errcode.ParseFailed},
		{"validation error", &gqlerror.Error{Message: "exceeded token limit", Extensions: map[string]any{"code": errcode.ValidationFailed}}, errcode.ValidationFailed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ErrorPresenter(context.Background(), tt.err)
			if got.Extensions["code"] != tt.want {
				t.Fatalf("code = %v, want %s", got.Extensions["code"], tt.want)
			}
		})
	}
}
