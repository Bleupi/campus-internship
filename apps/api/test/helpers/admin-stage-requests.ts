import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../../src/prisma/prisma.service";
import { cookieMap, requireCookie } from "./cookies";
import { snapshotV1 } from "./stage-snapshot";

export type StageOverrides = {
  status?: "DRAFT" | "PENDING" | "VALIDATED" | "REFUSED";
  submittedAt?: Date | null;
  semester?: "S1" | "S2";
  mandatory?: boolean;
  periods?: { startDate: Date; endDate: Date }[];
  service?: string | null;
  projectType?: string | null;
  motivation?: string | null;
  organism?: Partial<{ street: string; postalCode: string; city: string }>;
  tutor?: Partial<{ phone: string | null; acceptsPhoneContact: boolean }>;
};

// Shared by the admin-stage-requests-list and -detail e2e files (each runs its
// own app/DB-tracking instance, so this is a factory rather than file-scope
// state) — kept as one implementation so a BR-02/BR-03 fixture-shape change
// only needs one edit.
export function createStageRequestHelpers(
  app: INestApplication,
  prisma: PrismaService,
  emailPrefix: string,
  createdUserEmails: string[],
  createdReferentEmails: string[],
  createdOrganismIds: string[],
) {
  async function signupStudent(
    lastName = "Dupont",
  ): Promise<{ token: string; profileId: string; email: string }> {
    const email = `e2e.${emailPrefix}.student.${randomUUID()}@etu.u-paris.fr`;
    createdUserEmails.push(email);
    const response = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email, password: "a-password-that-is-long-enough", firstName: "Étu", lastName })
      .expect(201);
    const profile = await prisma.studentProfile.update({
      where: { userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id },
      data: { promotion: "L2" },
    });
    return {
      token: requireCookie(cookieMap(response), "access_token"),
      profileId: profile.id,
      email,
    };
  }

  async function seedReferent(lastName: string) {
    const email = `e2e.${emailPrefix}.referent.${randomUUID()}@univ.fr`;
    createdReferentEmails.push(email);
    return prisma.referentProfile.create({
      data: {
        user: {
          create: { email, passwordHash: "x", firstName: "Réf", lastName, roles: ["REFERENT"] },
        },
      },
    });
  }

  async function seedStage(studentId: string, overrides: StageOverrides = {}) {
    const organism = await prisma.hostOrganism.create({
      data: {
        name: `Organisme ${randomUUID()}`,
        structureType: "Secteur Sanitaire",
        city: overrides.organism?.city ?? "Paris",
        postalCode: overrides.organism?.postalCode ?? "75014",
        street: overrides.organism?.street ?? "1 rue Test",
        tutors: {
          create: {
            firstName: "Marie",
            lastName: "Curie",
            email: "m.curie@example.org",
            jobTitle: "Médecin",
            phone: overrides.tutor?.phone,
            acceptsPhoneContact: overrides.tutor?.acceptsPhoneContact ?? false,
          },
        },
      },
      include: { tutors: true },
    });
    createdOrganismIds.push(organism.id);
    const status = overrides.status ?? "PENDING";
    return prisma.stage.create({
      data: {
        studentId,
        organismId: organism.id,
        tutorId: organism.tutors[0]!.id,
        status,
        schoolYear: "2099-2100",
        semester: overrides.semester ?? "S1",
        mandatory: overrides.mandatory ?? true,
        service: overrides.service === undefined ? "Service de test" : overrides.service,
        // BR-02: submission requires these non-blank, so a real PENDING stage
        // never has them null — only explicit overrides may still force null
        // (e.g. for a DRAFT fixture).
        projectType:
          overrides.projectType === undefined ? "Type de handicap de test" : overrides.projectType,
        motivation:
          overrides.motivation === undefined ? "Motivation de test" : overrides.motivation,
        submittedAt:
          overrides.submittedAt === undefined
            ? status === "DRAFT"
              ? null
              : new Date("2099-01-05T09:00:00.000Z")
            : overrides.submittedAt,
        periods: {
          create: overrides.periods ?? [
            { startDate: new Date("2099-10-01"), endDate: new Date("2099-10-31") },
          ],
        },
      },
      include: { organism: true, tutor: true },
    });
  }

  // Issue #154: a previously VALIDATED mandatory stage, seeded directly with
  // a frozen snapshot rather than through the real validate flow (same
  // shortcut as helpers/stage-snapshot.ts was built for) — findById() only
  // ever reads these from the snapshot, never the live row.
  async function seedValidatedMandatoryStage(
    studentId: string,
    overrides: {
      schoolYear?: string;
      semester?: "S1" | "S2";
      decidedAt?: Date;
      organismName?: string;
      structureType?: string;
      service?: string;
      promotion?: string;
    } = {},
  ) {
    const pending = await seedStage(studentId, { mandatory: true });
    const organismName = overrides.organismName ?? pending.organism!.name;
    return prisma.stage.update({
      where: { id: pending.id },
      data: {
        status: "VALIDATED",
        snapshotVersion: 1,
        decidedAt: overrides.decidedAt ?? new Date("2099-06-01T00:00:00.000Z"),
        snapshot: snapshotV1({
          schoolYear: overrides.schoolYear ?? "2099-2100",
          semester: overrides.semester ?? "S1",
          mandatory: true,
          service: overrides.service ?? "Service de test",
          organism: {
            id: pending.organismId,
            name: organismName,
            structureType: overrides.structureType ?? "Secteur Sanitaire",
            city: "Paris",
            postalCode: "75014",
            street: "1 rue Test",
          },
          promotion: overrides.promotion ?? "L2",
        }),
      },
    });
  }

  return { signupStudent, seedReferent, seedStage, seedValidatedMandatoryStage };
}
