---
"api": patch
---

Fix `GET /organisms/structure-types` returning 403 for an `ADMIN` caller (PR163 QA). The route was still guarded `STUDENT`-only from when it was student-wizard-only (issue #113); issue #146's admin stage-requests list also calls it, through `StructureTypeLabel`, to colour each row's structure type. The route now overrides the class-level role to accept `STUDENT` or `ADMIN` — `search` and `:id` stay student-only. This was also the "colours take several seconds to appear" symptom: the failing request retried three times (TanStack Query's default `retry: 3` with exponential backoff) before the chip fell back to its hash-based colour.
