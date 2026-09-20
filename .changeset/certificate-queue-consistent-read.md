---
"api": patch
---

Fix a race in `GET /admin/students/certificate-queue`: Prisma loads the profile and its `user` with separate statements, so a user deleted between them left `profile.user` null and the endpoint answered 500 ("Inconsistent query result"). The queue is now read in one `RepeatableRead` transaction, i.e. from a single snapshot.
