---
"web": patch
---

Start every login and signup from an empty query cache. A session that expired with the tab open could leave the student-profile query errored, and `useProfile`'s `retryOnMount: false` replayed that error at the next login instead of refetching, so a student whose profile had been validated meanwhile saw "Impossible de charger le profil" until a page reload. Dropping the previous session's cache also stops one account's cached data from surfacing under another account logging in on the same tab.
