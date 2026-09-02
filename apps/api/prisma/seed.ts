// Dev-only fixture data: ~20 student accounts spread across every
// ProfileStatus (INCOMPLETE, PENDING_VALIDATION, VALID, EXPIRED), each with
// the FileObject rows that status implies, so the admin cert-validation
// queue (#41/#42) and the student profile flow (#9/#10/#12) have something
// real to look at locally without walking through signup/upload by hand.
//
// Idempotent: re-running deletes and recreates the fixed set of seed emails
// below (cascade removes their StudentProfile/FileObject/RefreshToken rows)
// rather than accumulating duplicates. It does NOT delete the S3 objects
// from a previous run — harmless orphaned bytes in a local MinIO bucket,
// never run against a prod-like environment.
import { randomUUID } from "node:crypto";
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  HeadBucketCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient, type Promotion } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { getCurrentSchoolYear, getSchoolYearEnd, STUDENT_EMAIL_DOMAIN } from "shared";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the dev seed script against production.");
}

const prisma = new PrismaClient();
const s3 = new S3Client({
  endpoint: requireEnv("S3_ENDPOINT"),
  region: process.env.S3_REGION ?? "fr-par",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
  },
});
const BUCKET = requireEnv("S3_BUCKET");

// satisfies signupSchema's min(18); not a real credential, this is local-only
// seed data (never committed with a live meaning beyond a dev/CI database).
const SEED_PASSWORD = "MotDePasseDemo2026!";

const CURRENT_YEAR = getCurrentSchoolYear();
const PREVIOUS_YEAR = shiftSchoolYear(CURRENT_YEAR, -1);

const DAY_MS = 24 * 60 * 60 * 1000;

// Minimal-but-valid fixture bytes, so an admin opening one in the browser
// sees a real (tiny) image/PDF instead of a broken preview.
const ID_PHOTO_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkI" +
    "CQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
    "AAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==",
  "base64",
);

const CERTIFICATE_BYTES = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw" +
    "IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8" +
    "PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAxMDAgMTAwXT4+CmVuZG9iagp4" +
    "cmVmCjAgNAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1" +
    "OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA0L1Jvb3QgMSAw" +
    "IFI+PgpzdGFydHhyZWYKMTkwCiUlRU9G",
  "base64",
);

type FileSpec = {
  type: "ID_PHOTO" | "INSURANCE_CERTIFICATE";
  uploadedDaysAgo: number;
  expired?: boolean; // certificate tied to PREVIOUS_YEAR instead of CURRENT_YEAR
};

interface SeedStudent {
  localPart: string; // -> `${localPart}${STUDENT_EMAIL_DOMAIN}`
  firstName: string;
  lastName: string;
  promotion: Promotion | null;
  profileStatus: "INCOMPLETE" | "PENDING_VALIDATION" | "VALID" | "EXPIRED";
  profileYear: string | null;
  createdDaysAgo: number;
  updatedDaysAgo: number; // drives cert-queue FIFO ordering (waitingSince)
  files: FileSpec[];
}

const STUDENTS: SeedStudent[] = [
  // --- INCOMPLETE (5): every way a profile can still be missing something ---
  {
    localPart: "amel.rahmani",
    firstName: "Amel",
    lastName: "Rahmani",
    promotion: null,
    profileStatus: "INCOMPLETE",
    profileYear: null,
    createdDaysAgo: 2,
    updatedDaysAgo: 2,
    files: [],
  },
  {
    localPart: "thomas.lefevre",
    firstName: "Thomas",
    lastName: "Lefèvre",
    promotion: "L2",
    profileStatus: "INCOMPLETE",
    profileYear: null,
    createdDaysAgo: 6,
    updatedDaysAgo: 6,
    files: [],
  },
  {
    localPart: "sarah.benali",
    firstName: "Sarah",
    lastName: "Benali",
    promotion: "L3",
    profileStatus: "INCOMPLETE",
    profileYear: null,
    createdDaysAgo: 4,
    updatedDaysAgo: 3,
    files: [{ type: "ID_PHOTO", uploadedDaysAgo: 3 }],
  },
  {
    localPart: "julien.moreau",
    firstName: "Julien",
    lastName: "Moreau",
    promotion: "L2",
    profileStatus: "INCOMPLETE",
    profileYear: null,
    createdDaysAgo: 5,
    updatedDaysAgo: 1,
    files: [{ type: "INSURANCE_CERTIFICATE", uploadedDaysAgo: 1 }],
  },
  {
    // Rejected by the admin after review (AdminStudentsService.rejectProfile):
    // files from the original submission are still attached, but the status
    // was pushed back to INCOMPLETE and profileYear stays frozen from when it
    // first reached PENDING_VALIDATION (issue #13 — no refusalReason column
    // yet, so the reason itself isn't visible here, only the resulting state).
    localPart: "camille.dubois",
    firstName: "Camille",
    lastName: "Dubois",
    promotion: "L3",
    profileStatus: "INCOMPLETE",
    profileYear: CURRENT_YEAR,
    createdDaysAgo: 10,
    updatedDaysAgo: 2,
    files: [
      { type: "ID_PHOTO", uploadedDaysAgo: 10 },
      { type: "INSURANCE_CERTIFICATE", uploadedDaysAgo: 10 },
    ],
  },

  // --- PENDING_VALIDATION (6): spread across the ~15-day admin window ---
  ...(
    [
      ["nadia.cherif", "Nadia", "Cherif", "L2", 14],
      ["hugo.girard", "Hugo", "Girard", "L3", 11],
      ["lea.fontaine", "Léa", "Fontaine", "L2", 7],
      ["mehdi.saidi", "Mehdi", "Saïdi", "L3", 3],
      ["ines.perrin", "Inès", "Perrin", "L2", 1],
      ["antoine.roux", "Antoine", "Roux", "L3", 0],
    ] as const
  ).map(([localPart, firstName, lastName, promotion, waitingDays]) => ({
    localPart,
    firstName,
    lastName,
    promotion,
    profileStatus: "PENDING_VALIDATION" as const,
    profileYear: CURRENT_YEAR,
    createdDaysAgo: waitingDays + 1,
    updatedDaysAgo: waitingDays,
    files: [
      { type: "ID_PHOTO" as const, uploadedDaysAgo: waitingDays + 1 },
      { type: "INSURANCE_CERTIFICATE" as const, uploadedDaysAgo: waitingDays },
    ],
  })),

  // --- VALID (5): up to date for the current school year -------------------
  ...(
    [
      ["marion.faure", "Marion", "Faure", "L2"],
      ["yassine.benjelloun", "Yassine", "Benjelloun", "L3"],
      ["chloe.simon", "Chloé", "Simon", "L2"],
      ["nicolas.perez", "Nicolas", "Perez", "L3"],
      ["laura.bertrand", "Laura", "Bertrand", "L2"],
    ] as const
  ).map(([localPart, firstName, lastName, promotion], i) => ({
    localPart,
    firstName,
    lastName,
    promotion,
    profileStatus: "VALID" as const,
    profileYear: CURRENT_YEAR,
    createdDaysAgo: 20 + i,
    updatedDaysAgo: 15 - i,
    files: [
      { type: "ID_PHOTO" as const, uploadedDaysAgo: 20 + i },
      { type: "INSURANCE_CERTIFICATE" as const, uploadedDaysAgo: 20 + i },
    ],
  })),

  // --- EXPIRED (4): VALID last school year, rollover not yet re-triggered --
  // (BR-06 is evaluated lazily at login; seeding EXPIRED directly stands in
  // for "hasn't logged back in since the school year turned over".)
  ...(
    [
      ["paul.girardin", "Paul", "Girardin", "L3"],
      ["manon.leroy", "Manon", "Leroy", "L2"],
      ["adam.benyahia", "Adam", "Benyahia", "L3"],
      ["oceane.picard", "Océane", "Picard", "L2"],
    ] as const
  ).map(([localPart, firstName, lastName, promotion], i) => ({
    localPart,
    firstName,
    lastName,
    promotion,
    profileStatus: "EXPIRED" as const,
    profileYear: PREVIOUS_YEAR,
    createdDaysAgo: 200 + i,
    updatedDaysAgo: 200 + i,
    files: [
      // The id photo never expires — still "current" today.
      { type: "ID_PHOTO" as const, uploadedDaysAgo: 200 + i },
      // The certificate expired at the end of PREVIOUS_YEAR: currentFiles()
      // no longer counts it, which is exactly what makes the profile EXPIRED.
      { type: "INSURANCE_CERTIFICATE" as const, uploadedDaysAgo: 200 + i, expired: true },
    ],
  })),
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} — is .env loaded?`);
  return value;
}

// Only handles the one-year-back case this script needs, unlike
// getCurrentSchoolYear/getSchoolYearEnd (imported above) which stay the
// single source of truth for the format/semantics themselves (ADR-0012).
function shiftSchoolYear(schoolYear: string, deltaYears: number): string {
  const [start] = schoolYear.split("-").map(Number);
  const shifted = start! + deltaYears;
  return `${shifted}-${shifted + 1}`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY_MS);
}

async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch (error) {
    if (!(error instanceof NotFound)) throw error;
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (error) {
    if (!(error instanceof BucketAlreadyOwnedByYou)) throw error;
  }
}

async function seedStudent(student: SeedStudent): Promise<void> {
  const email = `${student.localPart}${STUDENT_EMAIL_DOMAIN}`;

  // Cascade (onDelete: Cascade on StudentProfile/FileObject/RefreshToken)
  // takes care of every dependent row.
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const created = daysAgo(student.createdDaysAgo);
  const updated = daysAgo(student.updatedDaysAgo);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: student.firstName,
      lastName: student.lastName,
      roles: ["STUDENT"],
      createdAt: created,
      updatedAt: updated,
      studentProfile: {
        create: {
          promotion: student.promotion,
          profileStatus: student.profileStatus,
          profileYear: student.profileYear,
          createdAt: created,
          updatedAt: updated,
        },
      },
    },
    include: { studentProfile: true },
  });

  const profileId = user.studentProfile!.id;

  for (const file of student.files) {
    const bucketKey = `students/${profileId}/${file.type}/${randomUUID()}`;
    const isPhoto = file.type === "ID_PHOTO";
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: bucketKey,
        Body: isPhoto ? ID_PHOTO_BYTES : CERTIFICATE_BYTES,
        ContentType: isPhoto ? "image/jpeg" : "application/pdf",
      }),
    );

    const expiresAt = isPhoto
      ? null
      : getSchoolYearEnd(file.expired ? PREVIOUS_YEAR : CURRENT_YEAR);

    await prisma.fileObject.create({
      data: {
        type: file.type,
        bucketKey,
        mimeType: isPhoto ? "image/jpeg" : "application/pdf",
        sizeBytes: isPhoto ? ID_PHOTO_BYTES.byteLength : CERTIFICATE_BYTES.byteLength,
        expiresAt,
        uploadedAt: daysAgo(file.uploadedDaysAgo),
        studentProfileId: profileId,
      },
    });
  }
}

async function main(): Promise<void> {
  await ensureBucket();

  for (const student of STUDENTS) {
    await seedStudent(student);
  }

  console.log(`Seeded ${STUDENTS.length} student accounts (password: ${SEED_PASSWORD}):\n`);
  const byStatus = new Map<string, string[]>();
  for (const s of STUDENTS) {
    const list = byStatus.get(s.profileStatus) ?? [];
    list.push(`${s.localPart}${STUDENT_EMAIL_DOMAIN}`);
    byStatus.set(s.profileStatus, list);
  }
  for (const [status, emails] of byStatus) {
    console.log(`${status} (${emails.length}):`);
    for (const email of emails) console.log(`  - ${email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
