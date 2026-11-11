#!/bin/sh
# Runs once, on first start of an empty Postgres volume (mounted into
# /docker-entrypoint-initdb.d by docker-compose.yml). Applies every migration
# with scripts/migrate.sh (which records them in schema_migrations), then the
# dev seed unless SEED_DEMO_DATA=false, then the reference shops (dev only,
# #169) when SEED_REFERENCE_SHOPS=true. Later migrations reach an existing
# volume through compose's `migrate` service, which runs on every start.
#
# To re-run from scratch: docker compose down -v && docker compose up
set -eu

# Demo and reference shops are fake data: never in a production database (#211).
if [ "${APP_ENV:-development}" = "production" ]; then
  if [ "${SEED_DEMO_DATA:-true}" = "true" ] || [ "${SEED_REFERENCE_SHOPS:-false}" = "true" ]; then
    echo "initdb: APP_ENV=production with SEED_DEMO_DATA or SEED_REFERENCE_SHOPS true; set both to false" >&2
    exit 1
  fi
fi

psql_run() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -q -f "$1"
}

# Over the local socket as POSTGRES_USER (the server listens on nothing else yet).
PGUSER="$POSTGRES_USER" PGDATABASE="$POSTGRES_DB" MIGRATIONS_DIR=/monicacafe/migrations \
  sh /monicacafe/scripts/migrate.sh

if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  echo "initdb: loading demo seed"
  psql_run /monicacafe/scripts/seed_dev.sql
else
  echo "initdb: SEED_DEMO_DATA=false — skipping demo seed"
fi

if [ "${SEED_REFERENCE_SHOPS:-false}" = "true" ]; then
  echo "initdb: loading reference shops (dev only)"
  psql_run /monicacafe/scripts/seed_reference.sql
fi
