import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Resolved from this file's own location, not the invocation cwd — the
// repo's single .env lives at the monorepo root, one level above apps/.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Vite auto-increments the port when 5173 is taken, which silently breaks
// CORS_ORIGINS/WEB_APP_URL — log the URL actually bound, next to the API URL
// this build talks to, so a mismatch is obvious in the `pnpm dev` output.
const logServerUrls: Plugin = {
  name: "log-server-urls",
  apply: "serve",
  configureServer(server) {
    server.httpServer?.once("listening", () => {
      // resolvedUrls isn't populated yet at this point; the socket is.
      const address = server.httpServer?.address();
      const port = typeof address === "object" && address ? address.port : "(unknown)";
      const url = `http://localhost:${port}`;
      const apiBaseUrl = server.config.env.VITE_API_BASE_URL ?? "(VITE_API_BASE_URL unset)";
      server.config.logger.info(
        `\n  [web] dev server listening on ${url}; API base URL: ${apiBaseUrl}\n`,
      );
    });
  },
};

export default defineConfig({
  plugins: [react(), logServerUrls],
  envDir: repoRoot,
  // Resolve "shared" straight to its TypeScript source instead of its
  // published dist/index.js. apps/api needs that dist build compiled to
  // CommonJS (see packages/shared/tsconfig.build.json) — but for apps/web,
  // going through the compiled CJS output means Vite's dependency
  // pre-bundler has to convert it to ESM, and that conversion is skipped
  // for pnpm-workspace-linked packages and doesn't get invalidated when
  // dist changes, causing stale/broken imports (e.g. "does not provide an
  // export named ..."). Aliasing to source makes Vite treat shared/src like
  // any other file in this app: transpiled directly, watched, no stale
  // pre-bundle cache to ever go bad.
  resolve: {
    alias: {
      shared: path.resolve(repoRoot, "packages/shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
