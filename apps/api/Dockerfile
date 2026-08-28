# syntax=docker/dockerfile:1.7
#
# Production image for the NestJS API (ADR-0022). Build context is the repo
# root, not apps/api — this needs packages/shared too (ADR-0010's workspace
# layout). See the root .dockerignore for what's excluded from that context.

FROM node:24-alpine AS base
# Pin the exact pnpm version pnpm-lock.yaml was generated with (matches the
# root package.json's "packageManager"), not whatever corepack defaults to.
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /repo

# -----------------------------------------------------------------------------
# build: full (dev+prod) dependency graph, compiles packages/shared then
# apps/api against the real source.
# -----------------------------------------------------------------------------
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
# The root "prepare": "husky" script runs on every workspace install
# regardless of --filter, and expects a .git directory this image never has
# — drop it here rather than in the tracked package.json, since it's only
# meaningless inside the image, not for real local installs.
RUN pnpm pkg delete scripts.prepare
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
# apps/api's own "postinstall" (package.json) runs `prisma generate` on every
# install, and — unlike @prisma/client's own postinstall, which just warns —
# it exits non-zero when the schema isn't there yet, failing the install
# below outright. So the schema has to be present *before* that install
# step, not copied in afterward with the rest of apps/api.
COPY apps/api/prisma apps/api/prisma
# --filter api... resolves apps/api plus its workspace dependency (shared)
# only — apps/web and its unrelated dependencies never enter this image.
RUN pnpm install --filter api... --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
# Redundant with the postinstall above in the common case, but kept as a
# safety net so nest build's type-check always sees node_modules/.prisma/client
# even if the schema changes here (COPY apps/api apps/api, line above) after
# the client was generated against the schema-only copy.
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter shared build && pnpm --filter api build

# -----------------------------------------------------------------------------
# prod-deps: a second, production-only install so devDependencies (nest cli,
# jest, typescript, ...) never reach the runtime image.
# -----------------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
RUN pnpm pkg delete scripts.prepare
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --filter api... --frozen-lockfile --prod
RUN pnpm --filter api exec prisma generate

# -----------------------------------------------------------------------------
# runtime: compiled output + prod-only node_modules, nothing else.
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/api/prisma apps/api/prisma
COPY --chown=node:node apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh

USER node
WORKDIR /repo/apps/api
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
