package graph

import (
	"context"
	"time"

	"github.com/99designs/gqlgen/graphql"
)

// Observer receives one record per executed GraphQL operation (#221). The
// metrics package implements it; status is "ok", "client_error" (the response
// carried errors, none internal) or "server_error" (an INTERNAL_SERVER_ERROR).
type Observer interface {
	ObserveOperation(name, status string, d time.Duration)
}

// Operation statuses reported to an Observer.
const (
	OpStatusOK          = "ok"
	OpStatusClientError = "client_error"
	OpStatusServerError = "server_error"
)

// ObserveOperations returns a gqlgen extension that reports every operation's
// name, outcome and duration to o. Operations rejected before they run (parse
// and validation errors, query limits) are reported too, as client errors.
func ObserveOperations(o Observer) graphql.HandlerExtension { return opObserver{o} }

type opObserver struct{ o Observer }

var _ interface {
	graphql.HandlerExtension
	graphql.ResponseInterceptor
} = opObserver{}

func (opObserver) ExtensionName() string                   { return "OperationMetrics" }
func (opObserver) Validate(graphql.ExecutableSchema) error { return nil }

func (e opObserver) InterceptResponse(ctx context.Context, next graphql.ResponseHandler) *graphql.Response {
	start := time.Now()
	resp := next(ctx)
	name := ""
	if graphql.HasOperationContext(ctx) {
		oc := graphql.GetOperationContext(ctx)
		name = oc.OperationName
		if name == "" && oc.Operation != nil {
			name = oc.Operation.Name // the document's own name when the client sent no operationName
		}
	}
	e.o.ObserveOperation(name, operationStatus(ctx, resp), time.Since(start))
	return resp
}

func operationStatus(ctx context.Context, resp *graphql.Response) string {
	status := OpStatusOK
	errs := graphql.GetErrors(ctx)
	if resp != nil && len(resp.Errors) > len(errs) {
		errs = resp.Errors
	}
	for _, err := range errs {
		status = OpStatusClientError
		if err.Extensions["code"] == CodeInternal {
			return OpStatusServerError
		}
	}
	return status
}
