---
"api": patch
---

Turn the stage-management feature on by default in the API (ADR-0029), as it already is in production: `FEATURE_STAGE_MANAGEMENT` now defaults to `"true"` in the env schema, and `"false"` still turns it off. The web flag keeps its explicit opt-in (`VITE_FEATURE_STAGE_MANAGEMENT === "true"`); only `.env.example` now sets it to `"true"`.
