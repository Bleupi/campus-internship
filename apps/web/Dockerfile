# syntax=docker/dockerfile:1.7
#
# Production image for the web app (ADR-0022): a Vite static build served by
# a minimal nginx image. Build context is the repo root, not apps/web — this
# needs packages/shared too (ADR-0010's workspace layout). See the root
# .dockerignore for what's excluded from that context.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
# The root "prepare": "husky" script runs on every workspace install
# regardless of --filter, and expects a .git directory this image never has
# — drop it here rather than in the tracked package.json, since it's only
# meaningless inside the image, not for real local installs.
RUN pnpm pkg delete scripts.prepare
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
# --filter web... resolves apps/web plus its workspace dependency (shared)
# only — apps/api and its unrelated dependencies never enter this image.
RUN pnpm install --filter web... --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
# apps/web's own build (`tsc -b && vite build`) type-checks "shared" against
# its published dist/index.d.ts (package.json's "types" field), not its
# source — even though Vite itself aliases "shared" straight to source for
# dev (see apps/web/vite.config.ts). shared must be built first regardless.
RUN pnpm --filter shared build
# VITE_* vars are baked into the static bundle at build time, not read at
# container runtime — pass the API's public URL as a build arg.
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
