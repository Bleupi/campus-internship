import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Resolved from this file's own location, not the invocation cwd — the
// repo's single .env lives at the monorepo root, one level above apps/.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  // "shared" is a pnpm-workspace symlink, not a real node_modules dep, so
  // Vite's dependency scanner skips it by default and serves its CommonJS
  // dist/index.js straight to the browser — which has no ESM named exports.
  // Forcing it through optimizeDeps runs the same esbuild CJS→ESM interop
  // normal npm dependencies get.
  optimizeDeps: {
    include: ["shared"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
