import { execSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { readTestTargets, workerDatabaseName } from "./test-targets";

// Jest `globalSetup`: once per run, makes sure the dedicated test database
// exists and is migrated to the current schema (ADR-0030), then clones it into
// one fresh database per worker (ADR-0034). The test database itself is only a
// template: no spec connects to it. The test bucket needs nothing here:
// FilesService creates it on boot outside production (ADR-0021).
export default async function globalSetup(globalConfig: { maxWorkers: number }): Promise<void> {
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

    execSync("pnpm exec prisma migrate deploy", {
      cwd: join(__dirname, "../.."),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });

    // Dropped and re-cloned on every run, so a worker always starts from the
    // migrated, empty schema, whatever an interrupted run left behind. Cloning
    // needs no other session on the template: migrate deploy has exited by now.
    for (let workerId = 1; workerId <= globalConfig.maxWorkers; workerId++) {
      const workerName = workerDatabaseName(databaseName, workerId);
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${workerName}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${workerName}" TEMPLATE "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}
