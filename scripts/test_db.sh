#!/bin/sh
# Creates (or recreates) a database of its own for the Go integration tests,
# migrated to the newest schema, and prints its URL (#295). The tests leave
# their rows behind (users, shops and coffees named "Keep", "C1", …), so
# running them against the dev database fills the local demo with junk.
#
#   export TEST_DATABASE_URL=$(./scripts/test_db.sh)
#   cd backend && go test -race ./...
#
# ADMIN_URL is a connection to an existing database on the same server
# (default: the compose dev database); TEST_DB names the database to create
# (default monicacafe_test). Re-running drops and recreates it.
set -eu

admin=${ADMIN_URL:-postgres://monica:monica_secret@localhost:5432/monicacafe}
name=${TEST_DB:-monicacafe_test}
case "$name" in
  *[!a-z0-9_]*|"") echo "test_db: TEST_DB must be lowercase letters, digits and _" >&2; exit 1 ;;
esac

psql -X -q -v ON_ERROR_STOP=1 "$admin" -c "DROP DATABASE IF EXISTS $name WITH (FORCE)" -c "CREATE DATABASE $name" >&2
url=$(printf '%s' "$admin" | sed -E "s#/[^/?]*(\?|\$)#/$name\1#")
DATABASE_URL=$url "$(dirname "$0")/migrate.sh" >&2
printf '%s\n' "$url"
