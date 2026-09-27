---
"api": patch
---

Seed the organism structure types ("Secteur Médico-social", "Secteur Sanitaire", "Secteur Fédéral", "Secteur Libéral", "Secteur Associatif") through a data migration, so every environment, production included, gets a non-empty structure-type dropdown in the stage wizard. The migration is additive and idempotent (`ON CONFLICT ("label") DO NOTHING`): it never deletes or overwrites an existing label.
