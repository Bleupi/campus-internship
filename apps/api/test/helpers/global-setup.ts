import { execSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { readTestTargets } from "./test-targets";

// Jest `globalSetup`: once per run, makes sure the dedicated test database
// exists and is migrated to the current schema (ADR-0030). The test bucket
// needs nothing here: FilesService creates it on boot outside production
// (ADR-0021).
export default async function globalSetup(): Promise<void> {
  const { databaseUrl, databaseName } = readTestTargets();

  // CREATE DATABASE can't target the database being created, so connect to the
  // server's built-in maintenance database with the same credentials.
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existing = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`;
    if (existing.length === 0) {
      // databaseName is validated against /^[A-Za-z0-9_]+_test$/ above, so it's
      // safe to interpolate (identifiers can't be bound as parameters).
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("pnpm exec prisma migrate deploy", {
    cwd: join(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}
