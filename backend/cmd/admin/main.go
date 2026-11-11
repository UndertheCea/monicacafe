// Command admin grants or revokes the ADMIN role, so the first admin doesn't
// need raw SQL (#224):
//
//	go run ./cmd/admin grant someone@example.com
//	go run ./cmd/admin revoke someone@example.com
//
// In compose: docker compose exec backend /app/admin grant someone@example.com
// (the backend image ships this binary next to the server). It reads
// DATABASE_URL like the server. The change is written to the audit log with no
// actor, and the account's token version is bumped, so tokens carrying the old
// role stop working for writes at once; the person signs in again (or their
// next token refresh) to pick up the new role.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/underthecea/monicacafe/backend/internal/db"
	"github.com/underthecea/monicacafe/backend/internal/platform/config"
	"github.com/underthecea/monicacafe/backend/internal/store"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

// command is a parsed command line.
type command struct {
	grant bool
	email string
}

// parseArgs accepts exactly "grant|revoke <email>".
func parseArgs(args []string) (command, error) {
	if len(args) != 2 {
		return command{}, errors.New("usage: admin grant|revoke <email>")
	}
	var c command
	switch args[0] {
	case "grant":
		c.grant = true
	case "revoke":
	default:
		return command{}, fmt.Errorf("unknown command %q (want grant or revoke)", args[0])
	}
	c.email = strings.ToLower(strings.TrimSpace(args[1]))
	if !strings.Contains(c.email, "@") {
		return command{}, fmt.Errorf("%q is not an email address", args[1])
	}
	return c, nil
}

func run(args []string, stdout, stderr io.Writer) int {
	cmd, err := parseArgs(args)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := db.New(ctx, config.Load().DatabaseURL, db.Options{MaxConns: 1})
	if err != nil {
		fmt.Fprintln(stderr, "connect:", err)
		return 1
	}
	defer pool.Close()

	u, err := store.New(pool).SetAdminRole(ctx, cmd.email, cmd.grant)
	switch {
	case errors.Is(err, store.ErrNotFound):
		fmt.Fprintf(stderr, "no account with email %s\n", cmd.email)
		return 1
	case errors.Is(err, store.ErrNoChange):
		fmt.Fprintf(stdout, "%s already has that role; nothing changed\n", cmd.email)
		return 0
	case err != nil:
		fmt.Fprintln(stderr, err)
		return 1
	}
	fmt.Fprintf(stdout, "%s is now %s\n", u.Email, u.Role)
	return 0
}
