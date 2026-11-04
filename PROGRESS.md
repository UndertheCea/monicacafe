# Monica Cafe — Build Progress

## Iteration 1: Initial Scaffold ✅

### What was done
- Created full project directory structure
- **Go backend** (`backend/`):
  - Go 1.24 module (`github.com/underthecea/monicacafe/backend`)
  - gqlgen v0.17.73 setup with full GraphQL schema (users, producers, coffees, variants, orders, reviews, subscriptions)
  - Code-generated: `graph/generated/generated.go`, `graph/model/models_gen.go`, resolver stubs
  - `internal/auth/jwt.go` — JWT access + refresh token service (HS256, 15m/7d TTL)
  - `internal/middleware/auth.go` — HTTP auth middleware (Bearer token extraction)
  - `internal/db/db.go` — pgxpool connection helper
  - `cmd/server/main.go` — chi router, CORS, auth middleware, GraphQL handler on :4000
  - `Dockerfile` — multi-stage alpine build
  - Passes `go build ./...` and `go vet ./...`
- **Next.js frontend** (`frontend/`):
  - Next.js 15.3.1, React 19, TypeScript strict, Tailwind CSS v4
  - App Router layout with Geist fonts and metadata
  - Home page with hero section and features grid
  - `lib/graphql.ts` — graphql-request client
  - `lib/utils.ts` — `cn()` and `formatPrice()` helpers
  - `Dockerfile` — standalone output build
  - Passes TypeScript type check
- **Nginx** (`nginx/nginx.conf`) — proxies `/` → frontend:3000, `/graphql` → backend:4000
- **Docker Compose** (`docker-compose.yml`) — postgres:17, redis:7, meilisearch:v1.14, backend, frontend, nginx; all with healthchecks
- **SQL migration** (`migrations/001_initial.sql`) — full schema + seed data (3 producers, 3 coffees, 6 variants)
- `.gitignore`

---

## Component Status

| Component             | Status      |
|-----------------------|-------------|
| Project scaffold      | ✅ Done      |
| Docker Compose + infra| ✅ Done      |
| Go module + gqlgen    | ✅ Done      |
| GraphQL schema        | ✅ Done      |
| Database migrations   | ✅ Done      |
| Seed data             | ✅ Done      |
| JWT auth service      | ✅ Done      |
| Auth middleware       | ✅ Done      |
| GraphQL resolvers     | 🔲 Not started |
| Next.js scaffold      | ✅ Done      |
| Product listing page  | 🔲 Not started |
| Product detail page   | 🔲 Not started |
| Cart / checkout       | 🔲 Not started |
| Stripe integration    | 🔲 Not started |
| Meilisearch indexing  | 🔲 Not started |
| Search UI             | 🔲 Not started |
| Auth UI (login/signup)| 🔲 Not started |
| Reviews               | 🔲 Not started |
| Subscriptions         | 🔲 Not started |

---

## Next Iteration: Database Schema + Auth Resolvers

**Goal**: Wire up real database access and implement the auth flow end-to-end.

Planned work:
1. Add `pgxpool.Pool` to `graph.Resolver` via dependency injection from `main.go`
2. Implement `register`, `login`, `refreshToken`, `logout` resolvers with real DB + bcrypt
3. Store refresh tokens in Redis (key: `refresh:{userID}`, TTL 7d)
4. Implement `me` query resolver (requires auth middleware context)
5. Add a `migrate` package using `jackc/pgx` to run migrations on startup
6. Write `coffees`, `coffee`, `producers`, `producer` query resolvers (read-only, real DB)
7. Seed data already in migration — verify it loads correctly
