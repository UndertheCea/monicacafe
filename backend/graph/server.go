package graph

import (
	"context"
	"fmt"

	"github.com/99designs/gqlgen/complexity"
	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
	"github.com/vektah/gqlparser/v2/lexer"

	"github.com/underthecea/monicacafe/backend/graph/generated"
	"github.com/underthecea/monicacafe/backend/graph/model"
)

// Limits on a single GraphQL request (#207). Together they keep one request,
// signed in or not, from fanning out into thousands of SQL queries or a
// multi-megabyte response. TestFrontendOperationsFitTheLimits checks every query
// the site sends against them with each page size at the API's maximum of 100:
// the largest (the shop page, two lists of cards) then costs about 5,200. At the
// page sizes the site really uses, nothing costs more than about 1,000.
const (
	// MaxQueryComplexity bounds the cost worked out by complexityRoot.
	MaxQueryComplexity = 8000
	// MaxQueryDepth bounds field nesting; the site's deepest query is 6.
	MaxQueryDepth = 8
	// ParserTokenLimit bounds the size of a document before it is validated.
	ParserTokenLimit = 5000
	// QueryCacheSize is how many parsed documents are kept; the site has
	// about 60 distinct ones.
	QueryCacheSize = 200
	// MaxRequestBytes bounds the /graphql body. The largest legitimate
	// request is a coffee with ten options: a few kilobytes.
	MaxRequestBytes = 100 << 10
)

// Costs of fields that run their own SQL query for every parent object (no
// dataloader). A list of 100 coffees asking each for `similar` runs 100
// scoring scans, so the scan itself is priced, not just the rows it returns:
// at 400 one request can run at most 20 of them.
const (
	perParentQueryCost = 10
	similarQueryCost   = 400
)

// complexityRoot prices every list field as its (clamped) limit times the
// cost of one item, using the same clamps as the resolvers. gqlgen's default
// is 1 per field whatever the limit, which made a 15,000-query request cost 6.
func complexityRoot() generated.ComplexityRoot {
	var c generated.ComplexityRoot
	paged := func(base int) func(child int, limit, offset *int) int {
		return func(child int, limit, _ *int) int {
			l, _ := page(limit, nil)
			return base + l*child
		}
	}
	c.Query.Shops = func(child int, _, _ *string, _ *model.ShopSort, limit, _ *int) int {
		return paged(1)(child, limit, nil)
	}
	c.Query.Coffees = func(child int, _ *model.CoffeeFilter, _ *model.CoffeeSort, limit, _ *int) int {
		return paged(1)(child, limit, nil)
	}
	c.Query.PopularCoffees = func(child int, limit *int) int { return paged(1)(child, limit, nil) }
	c.Query.FollowingCoffees = paged(1)
	c.Query.AdminUsers = func(child int, _ *string, limit, _ *int) int { return paged(1)(child, limit, nil) }
	c.Query.AdminShops = func(child int, _ *string, limit, _ *int) int { return paged(1)(child, limit, nil) }
	c.Query.AuditLog = paged(1)
	c.Query.Reports = func(child int, _ *model.ReportStatus, limit, _ *int) int { return paged(1)(child, limit, nil) }

	c.Shop.Coffees = func(child int, _ *model.CoffeeFilter, _ *model.CoffeeSort, limit, _ *int) int {
		return paged(perParentQueryCost)(child, limit, nil)
	}
	c.Shop.RecentComments = paged(perParentQueryCost)
	c.User.Comments = paged(perParentQueryCost)
	c.User.SavedCoffees = paged(perParentQueryCost)
	c.User.FollowedShops = paged(perParentQueryCost)
	c.Coffee.Comments = paged(perParentQueryCost)
	c.Coffee.Similar = func(child int, limit *int) int { return similarQueryCost + similarLimit(limit)*child }
	return c
}

// NewServer builds the GraphQL handler with the request limits above. The API
// (cmd/server) and the integration tests share it, so the tests run under the
// limits production enforces.
func NewServer(resolver *Resolver, introspection bool) *handler.Server {
	srv := handler.New(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Complexity: complexityRoot(),
	}))
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](QueryCacheSize))
	srv.SetParserTokenLimit(ParserTokenLimit)
	srv.SetErrorPresenter(ErrorPresenter)
	srv.SetRecoverFunc(RecoverFunc)
	srv.Use(&queryLimits{maxComplexity: MaxQueryComplexity, maxDepth: MaxQueryDepth})
	srv.Use(tokenGate{users: resolver.Store})
	srv.Use(extension.AutomaticPersistedQuery{Cache: lru.New[string](100)})
	if introspection {
		srv.Use(extension.Introspection{})
	}
	return srv
}

// queryLimits refuses an operation before it runs when it nests too deeply,
// asks for similar coffees of similar coffees, or costs too much.
type queryLimits struct {
	maxComplexity, maxDepth int
	es                      graphql.ExecutableSchema
}

var _ interface {
	graphql.HandlerExtension
	graphql.OperationContextMutator
} = (*queryLimits)(nil)

func (*queryLimits) ExtensionName() string { return "QueryLimits" }

func (q *queryLimits) Validate(es graphql.ExecutableSchema) error {
	q.es = es
	return nil
}

func (q *queryLimits) MutateOperationContext(ctx context.Context, opCtx *graphql.OperationContext) *gqlerror.Error {
	op := opCtx.Doc.Operations.ForName(opCtx.OperationName)
	if op == nil {
		return nil // gqlgen reports the missing operation itself
	}
	// gqlgen v0.17.73 drops the parser's "exceeded token limit" error and runs
	// whatever was parsed up to the limit, so the cut-off is reported here.
	if tooManyTokens(opCtx.RawQuery, ParserTokenLimit) {
		return errQueryTooComplex(fmt.Sprintf("query document has more than %d tokens", ParserTokenLimit))
	}
	shape := shapeOf(op.SelectionSet)
	switch {
	case shape.depth > q.maxDepth:
		return errQueryTooComplex(fmt.Sprintf("query nests %d levels deep; the limit is %d", shape.depth, q.maxDepth))
	case shape.nestedSimilar:
		return errQueryTooComplex("similar coffees of similar coffees can't be requested in one query")
	}
	if cost := complexity.Calculate(ctx, q.es, op, opCtx.Variables); cost > q.maxComplexity {
		return errQueryTooComplex(fmt.Sprintf("query costs %d; the limit is %d. Ask for fewer items or fields per request", cost, q.maxComplexity))
	}
	return nil
}

func errQueryTooComplex(msg string) *gqlerror.Error {
	return &gqlerror.Error{Message: msg, Extensions: map[string]any{"code": CodeQueryTooComplex}}
}

// tooManyTokens reports whether query lexes to more than limit tokens. It
// stops at limit+1, and the request body is capped, so the work is bounded.
func tooManyTokens(query string, limit int) bool {
	lex := lexer.New(&ast.Source{Input: query})
	for n := 0; ; {
		tok, err := lex.ReadToken()
		if err != nil || tok.Kind == lexer.EOF {
			return false
		}
		if tok.Kind == lexer.Comment {
			continue
		}
		if n++; n > limit {
			return true
		}
	}
}

// queryShape is what queryLimits needs to know about a selection set.
type queryShape struct {
	// depth is the deepest field nesting: `{ a { b } }` is 2.
	depth int
	// nestedSimilar: Coffee.similar is selected somewhere beneath another
	// Coffee.similar. Each level multiplies a catalogue-wide scoring scan.
	nestedSimilar bool
}

// shapeOf walks a validated selection set, following fragments. Introspection
// fields (`__schema`, `__type`) are skipped: the standard introspection query
// nests 13 deep, and it only runs where introspection is switched on.
func shapeOf(set ast.SelectionSet) queryShape {
	var out queryShape
	var walk func(set ast.SelectionSet, depth int, inSimilar bool)
	walk = func(set ast.SelectionSet, depth int, inSimilar bool) {
		for _, sel := range set {
			switch s := sel.(type) {
			case *ast.Field:
				if len(s.Name) > 1 && s.Name[:2] == "__" && len(s.SelectionSet) > 0 {
					continue
				}
				out.depth = max(out.depth, depth+1)
				similar := s.Name == "similar" && s.ObjectDefinition != nil && s.ObjectDefinition.Name == "Coffee"
				if similar && inSimilar {
					out.nestedSimilar = true
				}
				walk(s.SelectionSet, depth+1, inSimilar || similar)
			case *ast.InlineFragment:
				walk(s.SelectionSet, depth, inSimilar)
			case *ast.FragmentSpread:
				if s.Definition != nil {
					walk(s.Definition.SelectionSet, depth, inSimilar)
				}
			}
		}
	}
	walk(set, 0, false)
	return out
}
