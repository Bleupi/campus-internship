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

// Each Jest worker gets its own clone of the test database (ADR-0034), so two
// spec files running at the same time never read or delete each other's rows.
// The name keeps the "_test" suffix the guard above checks: campus_test ->
// campus_w1_test. JEST_WORKER_ID runs from 1 to maxWorkers.
export function workerDatabaseName(databaseName: string, workerId: number): string {
  return databaseName.replace(/_test$/, `_w${workerId}_test`);
}

export function workerDatabaseUrl(databaseUrl: string, workerId: number): string {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  url.pathname = `/${workerDatabaseName(databaseName, workerId)}`;
  return url.toString();
}
