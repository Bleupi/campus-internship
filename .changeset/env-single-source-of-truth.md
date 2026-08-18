---
"api": patch
---

Fix `docker-compose.yml` and `.env.example` disagreeing on local dev credentials — `docker-compose.yml` hardcoded Postgres/MinIO credentials while `.env.example` shipped generic placeholders (`USER:PASSWORD`) and blank S3 keys, so `cp .env.example .env` followed by `docker compose up -d` didn't actually produce a working local stack.

`.env`/`.env.example` now declare `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` and `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` as the source values. `docker-compose.yml` reads them via Docker Compose's native `${VAR}` substitution from the repo-root `.env` (no `env_file:` needed — Compose does this automatically). `DATABASE_URL`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` reference the same values via `${...}`, expanded by `dotenv-expand` — `apps/api`'s `ConfigModule.forRoot` now sets `expandVariables: true`. Verified end-to-end: `docker compose config` resolves the real values, and a live query against the actual Postgres container (`SELECT current_user, current_database()`) returned `stages`/`stages`, confirming both the container and the API's expanded `DATABASE_URL` agree.
