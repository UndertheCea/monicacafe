#!/bin/sh
# Runs once, on first start of an empty Postgres volume (mounted into
# /docker-entrypoint-initdb.d by docker-compose.yml). Applies every
# migration in order, then the dev seed unless SEED_DEMO_DATA=false.
#
# To re-run from scratch: docker compose down -v && docker compose up
set -eu

psql_run() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -q -f "$1"
}

for f in /monicacafe/migrations/*.sql; do
  echo "initdb: applying migration $(basename "$f")"
  psql_run "$f"
done

if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  echo "initdb: loading demo seed"
  psql_run /monicacafe/scripts/seed_dev.sql
else
  echo "initdb: SEED_DEMO_DATA=false — skipping demo seed"
fi
