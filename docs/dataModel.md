# Data Model

> Language convention: **code and schema in English**, UI in French. This document is the single source of truth for the database schema. ORM: **Prisma** · Database: **PostgreSQL** · Runtime validation: **Zod**

## Table of contents

1. [Auth & RBAC](#auth--rbac)
2. [Profiles](#profiles)
3. [Referent assignment](#referent-assignment)
4. [Files](#files)
5. [Host organism & tutor](#host-organism--tutor)
6. [Stage](#stage)
7. [Admin-configurable settings](#admin-configurable-settings)
8. [Key design decisions](#key-design-decisions)

---

## Auth & RBAC

We use **Role-Based Access Control**: one authenticatable `User` entity carries one or more `Role`s. Permissions derive from roles. A single user can be both `ADMIN` and `REFERENT` (see ADR-0001).

`firstName` / `lastName` live on `User` (single source of truth), so an admin-referent never has divergent names across profiles.

The **tutor never logs in** — it is plain data, not a `User`.

```prisma
enum Role {
  STUDENT
  ADMIN
  REFERENT
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique          // login email; for students this is the immutable etu.u-paris.fr email (STUDENT_EMAIL_DOMAIN); for staff (ADMIN/REFERENT) it will be u-pariscite.fr (STAFF_EMAIL_DOMAIN), not yet enforced — no personnel signup flow exists
  passwordHash String
  firstName    String
  lastName     String
  roles        Role[]                     // e.g. [ADMIN, REFERENT]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  studentProfile  StudentProfile?
  referentProfile ReferentProfile?
  refreshTokens   RefreshToken[]
  // adminProfile intentionally omitted in V1 (see ROADMAP_V2 / ADR-0002)
}
```

Login issues a short-lived JWT access token plus a refresh token (see ADR-0018). The refresh token is a high-entropy random value, never a JWT itself — only its SHA-256 hash is persisted, so a leaked database dump doesn't hand out usable tokens. Sessions are **multi-device**: each login creates its own `RefreshToken` row, so a student staying logged in on a phone and a laptop at the same time has two independent, independently-revocable rows.

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String   @unique          // SHA-256 hex digest of the raw token; the raw value never touches the DB
  expiresAt DateTime
  createdAt DateTime @default(now())

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String

  @@index([userId])
}
```

Refresh is a **rotate-on-use** operation: presenting a valid, unexpired token deletes that row and creates a new one (and a new access token) in the same transaction. A stolen-then-reused token that's already been rotated away simply fails to match any row — a reasonable baseline without building full token-family reuse tracking. Logout deletes only the row matching the presented token, revoking that one session and leaving a student's other concurrent sessions untouched.

---

## Profiles

Each role that carries its own data has a 1-1 profile. In V1 only `StudentProfile` and `ReferentProfile` exist. An admin is simply a `User` with the `ADMIN` role.

The student profile has its own **state machine** (see ADR-0004):

```prisma
enum ProfileStatus {
  INCOMPLETE          // missing fields or files
  PENDING_VALIDATION  // everything provided, awaiting admin check of insurance certificate
  VALID               // certificate verified by admin, up-to-date for current school year
  EXPIRED             // school year rolled over or certificate expired (lazy-computed at login)
}

enum Promotion {
  L2
  L3
}

model StudentProfile {
  id            String        @id @default(uuid())
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId        String        @unique

  phone         String?
  personalEmail String?                     // mutable, unlike the login (etu.u-paris.fr) email; must not itself be an etu.u-paris.fr address (STUDENT_EMAIL_DOMAIN)
  promotion     Promotion?                  // null until profile completion (issue #9/#10); signup creates a bare login only
  profileStatus ProfileStatus @default(INCOMPLETE)
  profileYear   String?                     // school year the profile is up-to-date for, e.g. "2024-2025"

  files               FileObject[]          // id photo + insurance certificate(s), see Files
  referentAssignments ReferentAssignment[]
  stages              Stage[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model ReferentProfile {
  id        String   @id @default(uuid())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String   @unique

  archived  Boolean  @default(false)

  assignments ReferentAssignment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Referent assignment

The referent of a stage is **not** a direct FK on `Stage`. It is derived on the fly from `ReferentAssignment` while the stage is live, then frozen into the snapshot on validation/refusal (see ADR-0003).

```prisma
model ReferentAssignment {
  id         String @id @default(uuid())
  schoolYear String                // "2024-2025"
  semester   Semester
  mandatory  Boolean               // matches Stage.mandatory: a student may have a
                                    // different referent for their mandatory vs. optional stage

  referent   ReferentProfile @relation(fields: [referentId], references: [id])
  referentId String

  student    StudentProfile  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  studentId  String

  createdAt  DateTime @default(now())

  @@unique([studentId, schoolYear, semester, mandatory]) // one referent per student / year / semester / stage kind
}
```

Reassignment (e.g. a referent falls ill mid-year) is an **UPDATE** of the existing row (`referentId` A → B); the unique tuple `(studentId, schoolYear, semester, mandatory)` is unchanged, so no conflict arises. V1 overwrites in place and keeps **no history** of past referents; an auditable variant (soft-delete + partial unique index) is deferred to V2 (see ROADMAP_V2). Overwriting never touches already-frozen snapshots: a referent change only affects `DRAFT`/`PENDING` stages, which re-derive on the fly.

---

## Files

Binary content lives in a **bucket** (S3 / MinIO), never in the database. The DB stores only metadata. `FileObject` carries `studentProfileId` + `type` (1-N relation), so adding a new file type is just a new enum value — no schema change (see ADR-0005).

The "exactly one valid insurance certificate" rule is enforced in application logic (take the most recent non-expired one), not by the schema. This also enables an insurance-certificate history later.

```prisma
enum FileType {
  ID_PHOTO
  INSURANCE_CERTIFICATE
}

model FileObject {
  id         String    @id @default(uuid())
  type       FileType
  bucketKey  String    @unique         // object key in S3/MinIO
  mimeType   String                    // image/jpeg, image/png, application/pdf
  sizeBytes  Int
  expiresAt  DateTime?                 // set for insurance certificate
  uploadedAt DateTime  @default(now())

  studentProfile   StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)
  studentProfileId String
}
```

Allowed MIME types (enforced in application/Zod layer):

- `ID_PHOTO`: `image/jpeg`, `image/png`
- `INSURANCE_CERTIFICATE`: `application/pdf`

---

## Host organism & tutor

In V1 the **service is a text field on `Stage`**, not on the organism. The list of services actively hosting students is derived from the stages. An `OrganismService` table linking tutors to services is planned for V2 (see ADR-0006 and ROADMAP_V2).

```prisma
model HostOrganism {
  id            String @id @default(uuid())
  name          String
  structureType String                    // value from OrganismStructureType (admin-configurable)
  city          String
  postalCode    String
  street        String

  tutors        Tutor[]
  stages        Stage[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Tutor {
  id                  String  @id @default(uuid())
  firstName           String
  lastName            String
  email               String
  jobTitle            String
  phone               String?
  acceptsPhoneContact Boolean @default(false)

  organism   HostOrganism @relation(fields: [organismId], references: [id])
  organismId String

  stages     Stage[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Stage

Single table. While `DRAFT`/`PENDING`, the live FKs (`student`, `organism`, `tutor`, `periods`) are authoritative. The **referent is not a FK on `Stage`**: it is derived on the fly from `ReferentAssignment` (by `studentId` + `schoolYear` + `semester` + `mandatory`, matching the stage's own `mandatory` flag) and is frozen into the `snapshot` only on validation/refusal. Once `VALIDATED`/`REFUSED`, the immutable `snapshot` (Zod-validated, versioned) becomes authoritative and the FKs are kept only for reporting (`onDelete: SetNull`). See ADR-0003.

Concurrency is handled with **optimistic locking** (`version`), suitable for the 1-2 admin scenario. Migration to pessimistic locking is documented in ADR-0007.

Multiple work periods are modeled by `StagePeriod` (see ADR-0008).

`schoolYear` is validated primarily by a shared Zod value-object (format`^\d{4}-\d{4}$`, second year = first + 1, normalization). A raw-SQL `CHECK` constraint on the format is added in migration as defense-in-depth: `CHECK ("schoolYear" ~ '^\d{4}-\d{4}$')`. The N+1 semantic rule stays in Zod only. The same value-object governs `Stage.schoolYear`, `ReferentAssignment.schoolYear` and `StudentProfile.profileYear`.

```prisma
enum StageStatus {
  DRAFT
  PENDING
  VALIDATED
  REFUSED
}

enum Semester {
  S1
  S2
}

model Stage {
  id            String      @id @default(uuid())
  status        StageStatus @default(DRAFT)
  schoolYear    String                      // "2024-2025"
  semester      Semester                    // derived, never entered (BR-04b)
  mandatory     Boolean     @default(false)

  service       String?                     // text in V1; OrganismService in V2
  projectType   String?                     // type of disability the student will face — required at submission
  motivation    String?                     // required at submission
  refusalReason String?                     // set only when REFUSED

  // Live relations — authoritative while DRAFT/PENDING
  student     StudentProfile @relation(fields: [studentId], references: [id])
  studentId   String

  organism    HostOrganism?  @relation(fields: [organismId], references: [id], onDelete: SetNull)
  organismId  String?

  tutor       Tutor?         @relation(fields: [tutorId], references: [id], onDelete: SetNull)
  tutorId     String?

  periods     StagePeriod[]

  // Immutable frozen copy — authoritative once VALIDATED/REFUSED (Zod-validated)
  snapshot        Json?
  snapshotVersion Int?

  // Duplication lineage (resubmission after refusal, or new request from an old one)
  parentStage   Stage?  @relation("StageLineage", fields: [parentStageId], references: [id])
  parentStageId String?
  childStages   Stage[] @relation("StageLineage")

  // Optimistic locking
  version   Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
  @@index([studentId])
}

model StagePeriod {
  id        String   @id @default(uuid())
  stage     Stage    @relation(fields: [stageId], references: [id], onDelete: Cascade)
  stageId   String
  startDate DateTime
  endDate   DateTime
  // hoursWorked planned for V2 (see ROADMAP_V2) — will bump snapshotVersion
}
```

---

## Admin-configurable settings

```prisma
model OrganismStructureType {
  id    String @id @default(uuid())
  label String @unique
}

model AdminSetting {
  id    String @id @default(uuid())
  key   String @unique          // e.g. "pdf_signature"
  value String
}
```

---

## Key design decisions

Every structuring decision is recorded as an ADR under `docs/adr/`:

- **ADR-0001** — RBAC with a central `User` and multiple roles
- **ADR-0002** — No `AdminProfile` in V1 (YAGNI)
- **ADR-0003** — Single `Stage` table with an immutable versioned snapshot
- **ADR-0004** — Student profile state machine
- **ADR-0005** — File storage in a bucket, metadata in DB, 1-N `FileObject`
- **ADR-0006** — Service as a text field in V1, `OrganismService` in V2
- **ADR-0007** — Optimistic locking for stage concurrency
- **ADR-0008** — Multiple work periods via `StagePeriod`
- **ADR-0009** - Temporal bounds as half-open intervals `[start, end)`
- **ADR-0010** - Monorepo with pnpm workspaces (Turborepo deferred)
- **ADR-0011** - `Semester` as a Prisma/Postgres enum, derived from periods
- **ADR-0012** - `schoolYear` as a shared Zod value-object + DB `CHECK`
- **ADR-0013** - Open-source (MIT), secret-scanning, and Git hooks
- **ADR-0014** - `ReferentAssignment` unique on `(student, schoolYear, semester, mandatory)`; reassignment by in-place update, no history in V1
- **ADR-0015** - Conventional Commits + SemVer 2.0.0, versions and changelog managed by Changesets
