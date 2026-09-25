---
"web": patch
---

Fix the admin stage-requests list silently refetching on window refocus/reconnect, which let a row's `version` (used by BR-09's optimistic-lock check for refusing a request, and read by the referent-reassignment picker) drift to whatever the database currently holds before the admin ever acted — without any visible change on screen. That defeated the "unchanged since read" guarantee: a genuine concurrent change (another admin's decision, a referent reassignment) could go unnoticed instead of surfacing the existing 409 reload prompt. `useStageRequests()` now only refetches on the initial load, its own mutations' invalidation, or an explicit page reload.
