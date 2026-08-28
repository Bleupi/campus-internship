---
"api": minor
---

Add `GET /health`, a liveness-only endpoint (issue #21, part of #20) — returns `200 { status: "ok" }` once the Nest app has finished bootstrapping, with no database query or other dependency check. Exempted from the global `JwtAuthGuard` via `@Public()`. Gives the upcoming container smoke-test job (ADR-0022) something to poll after the entrypoint's migration step, which already proves database reachability at boot.
