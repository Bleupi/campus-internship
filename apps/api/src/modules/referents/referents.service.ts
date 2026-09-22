import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type {
  AssignReferentRequest,
  AssignReferentResponse,
  CreateReferentRequest,
  CreateReferentResponse,
  ReferentListResponse,
} from "shared";
import { PrismaService } from "../../prisma/prisma.service";

const BCRYPT_ROUNDS = 10;

// ADR-0031: `User.passwordHash` is non-nullable, so a referent created from
// the admin UI gets the bcrypt hash of a random secret that is never stored or
// disclosed — no credential for it exists. A real bcrypt hash (not a sentinel
// string) keeps /auth/login's bcrypt.compare failing cleanly with a 401. The
// account is activated, if ever needed, via forgot-password (BR-13).
async function unusablePasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
}

@Injectable()
export class ReferentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Issue #148: all non-archived referents, sorted by last name — no
  // workload hint (explicitly rejected in #144's grilling).
  async list(): Promise<ReferentListResponse> {
    const referents = await this.prisma.referentProfile.findMany({
      where: { archived: false },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { lastName: "asc" } },
    });
    return referents.map((referent) => ({
      id: referent.id,
      firstName: referent.user.firstName,
      lastName: referent.user.lastName,
    }));
  }

  // ADR-0031: a new email creates a REFERENT user and its profile; an email
  // already on a User (e.g. an admin who is also a referent, ADR-0001) gets
  // the role and profile added instead — its name and password are never
  // touched, and no second account is created. The lookup is
  // case-insensitive so a differently-cased address still finds that user.
  // Re-adding an archived referent un-archives it: the admin just asked for
  // this person to be pickable. A concurrent create of the same new email
  // hits User.email's unique constraint (P2002), which the global
  // PrismaExceptionFilter turns into a 409.
  async create(dto: CreateReferentRequest): Promise<CreateReferentResponse> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: "insensitive" } },
      select: { id: true, roles: true },
    });

    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            ...(existing.roles.includes("REFERENT") ? {} : { roles: { push: "REFERENT" } }),
            referentProfile: { upsert: { create: {}, update: { archived: false } } },
          },
          include: { referentProfile: true },
        })
      : await this.prisma.user.create({
          data: {
            email: dto.email,
            passwordHash: await unusablePasswordHash(),
            firstName: dto.firstName,
            lastName: dto.lastName,
            roles: ["REFERENT"],
            referentProfile: { create: {} },
          },
          include: { referentProfile: true },
        });

    return {
      // Both branches create or upsert the profile in the same write.
      id: user.referentProfile!.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  // ADR-0014: upsert on the four-tuple as an in-place UPDATE, never a second
  // row — the unique constraint on (studentId, schoolYear, semester,
  // mandatory) guarantees that. This never touches Stage at all, so it can
  // never bump a Stage.version or reach a VALIDATED/REFUSED stage's frozen
  // snapshot: a decided stage's referent is read from the snapshot, not
  // derived from this table, by construction (ADR-0003).
  async assign(dto: AssignReferentRequest): Promise<AssignReferentResponse> {
    const assignment = await this.prisma.referentAssignment.upsert({
      where: {
        studentId_schoolYear_semester_mandatory: {
          studentId: dto.studentId,
          schoolYear: dto.schoolYear,
          semester: dto.semester,
          mandatory: dto.mandatory,
        },
      },
      update: { referentId: dto.referentId },
      create: {
        studentId: dto.studentId,
        schoolYear: dto.schoolYear,
        semester: dto.semester,
        mandatory: dto.mandatory,
        referentId: dto.referentId,
      },
      include: {
        referent: { include: { user: { select: { firstName: true, lastName: true } } } },
      },
    });
    return {
      id: assignment.referent.id,
      firstName: assignment.referent.user.firstName,
      lastName: assignment.referent.user.lastName,
    };
  }
}
