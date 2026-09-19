// The e2e specs must never touch the dev (or prod) database or bucket: they
// write, and the specs' cleanup deletes. Both the once-per-run global setup and
// each worker's env setup call this, so a mistyped DATABASE_TEST_URL /
// S3_TEST_BUCKET fails loudly before anything runs (ADR-0030).
export interface TestTargets {
  databaseUrl: string;
  databaseName: string;
  bucket: string;
}

export function readTestTargets(env: NodeJS.ProcessEnv = process.env): TestTargets {
  const databaseUrl = env.DATABASE_TEST_URL;
  const bucket = env.S3_TEST_BUCKET;
  if (!databaseUrl || !bucket) {
    throw new Error(
      "DATABASE_TEST_URL and S3_TEST_BUCKET must be set to run the e2e tests (see .env.example, ADR-0030).",
    );
  }

  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!/^[A-Za-z0-9_]+_test$/.test(databaseName)) {
    throw new Error(`Refusing to run e2e tests: database "${databaseName}" must end with "_test".`);
  }
  if (!bucket.endsWith("-test")) {
    throw new Error(`Refusing to run e2e tests: bucket "${bucket}" must end with "-test".`);
  }

  return { databaseUrl, databaseName, bucket };
}
