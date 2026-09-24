---
"api": minor
"web": minor
"shared": minor
---

Confirm a referent change that also reaches the student's other live requests (issue #149, part of #144). Each `GET /admin/stage-requests` item now carries `otherLiveStageCount`: how many other `DRAFT`/`PENDING` stages of the same student share its `(studentId, schoolYear, semester, mandatory)` tuple — decided stages and the request itself are never counted (ADR-0014). On "Demandes à traiter", changing the referent of such a request (from the picker or after adding a referent on the fly) opens a dialog — "Ce changement s'applique aussi à N autre(s) demande(s) en cours de l'étudiant X." — and the assignment is only sent once confirmed; cancelling leaves it untouched. A change that touches only the current request still applies immediately.
