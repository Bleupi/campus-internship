import type { PrismaService } from "../../src/prisma/prisma.service";

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
