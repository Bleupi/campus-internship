import type { PrismaService } from "../../src/prisma/prisma.service";

// Appended to the name of every HostOrganism an e2e spec creates, so leftovers
// from an interrupted run (Ctrl-C skips afterAll) can be found and swept later.
export const E2E_ORGANISM_TAG = "[e2e]";

// A leftover only counts as stale after this long: the e2e specs run in
// parallel workers, so a fresh row may belong to a suite still in progress.
const STALE_AFTER_MS = 60 * 60 * 1000;

interface PurgeTargets {
  userEmails?: string[];
  organismIds?: string[];
}

// Deletes everything an e2e spec may have created, in FK order: Stage.studentId
// and Tutor.organismId have no cascade (dataModel.md), so stages go before
// users, and tutors before organisms. Organisms are also discovered through the
// stages of the given users, so one whose id a failing test never got to record
// is still removed.
export async function purgeE2eData(
  prisma: PrismaService,
  { userEmails = [], organismIds = [] }: PurgeTargets,
): Promise<void> {
  const userStages = { student: { user: { email: { in: userEmails } } } };
  const stages = await prisma.stage.findMany({
    where: userStages,
    select: { organismId: true },
  });
  const allOrganismIds = [
    ...new Set([
      ...organismIds,
      ...stages.flatMap((stage) => (stage.organismId ? [stage.organismId] : [])),
    ]),
  ];

  await prisma.stage.deleteMany({ where: userStages });
  await prisma.tutor.deleteMany({ where: { organismId: { in: allOrganismIds } } });
  await prisma.hostOrganism.deleteMany({ where: { id: { in: allOrganismIds } } });
  await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
}

// Run from beforeAll: removes what an earlier, interrupted run left behind.
export async function sweepStaleE2eData(prisma: PrismaService): Promise<void> {
  const olderThan = new Date(Date.now() - STALE_AFTER_MS);
  const [users, organisms] = await Promise.all([
    prisma.user.findMany({
      where: { email: { startsWith: "e2e." }, createdAt: { lt: olderThan } },
      select: { email: true },
    }),
    prisma.hostOrganism.findMany({
      where: { name: { contains: E2E_ORGANISM_TAG }, createdAt: { lt: olderThan } },
      select: { id: true },
    }),
  ]);
  await purgeE2eData(prisma, {
    userEmails: users.map((user) => user.email),
    organismIds: organisms.map((organism) => organism.id),
  });
}
