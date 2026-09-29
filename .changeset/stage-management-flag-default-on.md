---
"api": patch
"web": patch
---

Turn the stage-management feature on by default (ADR-0029), as it already is in production: `FEATURE_STAGE_MANAGEMENT` now defaults to `"true"` in the API env schema, and the web app treats an unset `VITE_FEATURE_STAGE_MANAGEMENT` as on (the Dockerfile build arg and `.env.example` follow). Setting either to `"false"` still turns it off.
