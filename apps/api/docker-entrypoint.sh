#!/bin/sh
# ADR-0022: the database migration runs here, inside the container's own
# entrypoint, before the Nest server starts listening — never as a CI step —
# using a migrate-only credential (DATABASE_MIGRATE_URL) the running Nest
# process never holds. Falls back to DATABASE_URL so a single-credential
# setup (e.g. local `docker compose`, or the PR-push smoke test) still works
# without a separate migrate secret.
set -eu

DATABASE_URL="${DATABASE_MIGRATE_URL:-$DATABASE_URL}" node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma

exec "$@"
