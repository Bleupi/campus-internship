# User Flow & Use Cases

> Derived from the intended user experience. UI is in French; this document describes behaviour. Business rules referenced here are detailed in `businessRules.md`.

Three profiles can authenticate: **student**, **admin**, **referent** (see `dataModel.md`, RBAC). The **tutor never logs in**.

---

## Students

### Account management

As a student I want to:

- sign up
- log in
- view my profile information
- edit my profile information
- delete my account (unsubscribe)

At each login, the system lazily checks whether my profile is up to date for the current school year (see BR-01, BR-06). If not, I must update: promotion, school year, and insurance certificate.

### Profile validation flow (new in V1)

- When I have provided everything (including the insurance certificate) my profile moves to `PENDING_VALIDATION`.
- I can create and save stage **drafts** at any status.
- I can **submit** a stage request **only if my profile is `VALID`** (i.e. the admin has verified my certificate). See BR-02.

### Stage management

As a student I want to:

- submit a stage request:
  - fill in the request
  - save it as a draft
  - submit it, allowed only if **(a)** the request is complete **and** **(b)** my profile is `VALID`
  - the admin is notified on submission
- access my stage requests:
  - distinguish drafts / validated / refused / pending
  - sort by submission date or by stage date
  - if validated, download the associated PDF
- access a stage detail page
- duplicate a stage request to create a new one (keeps a `parentStageId` link)

When filling a request I can add **several work periods** (e.g. 1 week in October + 2 weeks in November). Front-end validation: at least one period, `end >= start` per period, no overlap, all periods in the same school year, and every period ending strictly before `01 September 00:00` of the next school year (half-open bound, see BR-04, BR-05). The semester is **not** chosen by the student — it is derived server-side from the periods, semester 1 winning when a stage straddles both (BR-04b).

---

## Admin

### Account management

As an admin I want to: sign up, log in, view and edit my profile.

### Certificate validation (first action, V1)

Because a stage cannot be validated unless the student profile is `VALID`, the **first admin action is validating insurance certificates**. The admin has a "Certificates to validate" queue listing students in `PENDING_VALIDATION`, with:

- **validate** → profile becomes `VALID`
- **reject** → profile returns to `INCOMPLETE`, with a reason; student notified

### Stage management

The admin has a **"Demandes à traiter"** page listing every submitted (`PENDING`) request, in submission order (oldest first). When a stage request is submitted to me, I want to:

- view everything the student provided (organism with its full address, service, project, motivation, tutor, periods) and the student's previous **mandatory** stages only, showing: structure type, host organism name, service
- see, on a request created by duplicating a refused one, the refused request's date and refusal reason
- **validate** a stage, or **refuse** it with a reason, one request at a time (never in bulk; no confirmation step on validation)
- have the student notified; on refusal the email includes the reason; on validation the referent is cc'd on the student's email (BR-07)

Decision conditions (validate **or** refuse):

- the student must have a referent for the stage's school year, semester **and `mandatory` flag** (a student may have a different referent for a mandatory vs. an optional stage in the same semester). If none exists, I must be able to **assign** one before deciding, and to **add a new referent on the fly** from the assignment picker if none exists yet. Deciding is **impossible** without a referent (it is required by the snapshot and by university administration). See BR-03.
- I can assign one referent to several selected requests at once. Whenever an assignment also applies to other live requests of the same student (same year, semester and `mandatory` flag), I confirm first ("s'applique aussi à N autre(s) demande(s) en cours de l'étudiant X"); a bulk assignment always shows one recap dialog.

Once decided, a request leaves that page and appears in the **"Historique des demandes"** page: a read-only, server-side paginated list of `VALIDATED`/`REFUSED` stages (most recently decided first, filter by status, search by the student's last/first name, accent- and case-insensitive), each opening its frozen snapshot.

Concurrency: stages use optimistic locking. If another admin saved a change first, I get a "this stage was modified, please reload" message.

### Student management

As an admin I want to:

- see the list of all students
- sort by: last name, promotion, school year

### Referent management

As an admin I want to:

- access the referent space and view all referents
- add referents
- archive referents
- assign students to a referent for a given semester of a school year, separately for mandatory and optional stages (a student may have two referents in one semester); reassigning simply overwrites the existing assignment

Dashboard warning: a message is shown if there is **no referent assigned** to L2/L3 students with a valid profile for the current year and semester (see BR-06).

### Host organism management

As an admin I want to:

- access the host-organism space
- see all organisms hosting students, and the different services within a single organism that host students
- export all organisms to **CSV**, choosing which columns to export

---

## Stage: live vs archived (summary)

- A **validated or refused** stage contains all its information **independently** of other data (immutable snapshot).
- A **pending or draft** stage keeps all its information **linked** to the other data, **except the referent**, which is not a FK on the stage: it is derived on the fly from `ReferentAssignment` (by student + school year + semester + mandatory) and may be added/changed by the admin before validation/refusal.

See ADR-0003 for the snapshot mechanism.

---

## Automated behaviour (lazy evaluation)

Yearly / semester resets are handled by **lazy evaluation**, not scheduled jobs:

- **Students**: at each login, check whether the profile is up to date for the current school year (BR-01, BR-06).
- **Referents**: in the admin panel, a warning is shown if no referent is assigned to eligible students for the current year/semester (BR-06).

Each new school year, students must update: promotion, school year, insurance certificate. Referent assignments reset every year and every semester.
