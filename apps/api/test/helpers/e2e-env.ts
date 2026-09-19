import { readTestTargets } from "./test-targets";

// Jest `setupFiles`: runs in every worker before the spec (and so before
// AppModule) loads. @nestjs/config gives process.env priority over .env, so
// pointing these two variables at the test targets redirects the whole app —
// PrismaService and FilesService included — without touching production code.
const { databaseUrl, bucket } = readTestTargets();
process.env.DATABASE_URL = databaseUrl;
process.env.S3_BUCKET = bucket;
