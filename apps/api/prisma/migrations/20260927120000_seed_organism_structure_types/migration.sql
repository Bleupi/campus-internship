-- Bootstrap the OrganismStructureType reference list (admin-configurable per
-- dataModel.md). Without these rows the stage wizard's organism-creation
-- dropdown is empty on a fresh environment.
--
-- Additive and idempotent: an existing label is left untouched, nothing is
-- deleted. Later changes to the list go in a new migration, never an edit of
-- this one. HostOrganism.structureType is a plain string, not a FK: a rename
-- must also UPDATE the organisms using the old label.
--
-- The id is supplied here because @default(uuid()) is applied by Prisma
-- Client, not by the database column.
INSERT INTO "OrganismStructureType" ("id", "label")
VALUES
  (gen_random_uuid()::text, 'Secteur Médico-social'),
  (gen_random_uuid()::text, 'Secteur Sanitaire'),
  (gen_random_uuid()::text, 'Secteur Fédéral'),
  (gen_random_uuid()::text, 'Secteur Libéral'),
  (gen_random_uuid()::text, 'Secteur Associatif')
ON CONFLICT ("label") DO NOTHING;
