import { readTestTargets, workerDatabaseUrl } from "./test-targets";

// Jest `setupFiles`: runs in every worker before the spec (and so before
// AppModule) loads. @nestjs/config gives process.env priority over .env, so
// pointing these two variables at the test targets redirects the whole app —
// PrismaService and FilesService included — without touching production code.
// The database is this worker's own clone, created by the global setup
// (ADR-0034); JEST_WORKER_ID is "1" under --runInBand too.
const { databaseUrl, bucket } = readTestTargets();
process.env.DATABASE_URL = workerDatabaseUrl(
  databaseUrl,
  Number(process.env.JEST_WORKER_ID ?? "1"),
);
process.env.S3_BUCKET = bucket;
