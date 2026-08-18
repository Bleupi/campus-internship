# Roadmap — V2 and beyond

> **DO NOT IMPLEMENT — OUT OF V1 SCOPE.** This file exists to park future ideas so they leave the V1 scope clean and so the code assistant does not implement them by accident.

## Period synthesis calendar (front-end)

A visual calendar in the stage form that highlights the selected weeks across the chosen periods, plus a computed summary ("Total duration: 3 weeks"). V1 ships the plain dynamic list of period rows; this is the richer visualization.

## Hours worked per period

Add `hoursWorked` (or similar) to `StagePeriod`, entered by the student per period. **This will bump `snapshotVersion`**: old snapshots stay at their current version without the field; new snapshots include it. This is the canonical justification for keeping `snapshotVersion` in V1.

## AdminProfile

Not created in V1 (an admin is just a `User` with the `ADMIN` role). When admin display/configuration settings are needed, add a 1-1 `AdminProfile` table. This is a **non-destructive migration** (new table, nothing changed). See ADR-0002.

## OrganismService

Introduce an `OrganismService` table to model services as first-class entities and **link tutors to the services of a single organism**. In V1 the service is a text field on `Stage`.

Migration path (non-destructive, see ADR-0006):

1. Add `OrganismService` table.
2. Add nullable `serviceId` on `Stage` and on `Tutor`.
3. Backfill: for each organism, de-duplicate the textual `service` values from its stages, create `OrganismService` rows, set `serviceId`.
4. Keep the text `service` column during transition, remove later.

Watch-out: textual services written inconsistently ("Cardiologie" vs "cardiologie" vs "Service de cardiologie") will create duplicates at migration time — normalize in the backfill script or clean up manually. Low risk, no blocker.

## Presigned upload URLs

Let the front-end upload files directly to the bucket via presigned URLs; the backend only signs. Cleaner and more scalable than proxying uploads through the API. V1 can proxy uploads to keep things simple.
