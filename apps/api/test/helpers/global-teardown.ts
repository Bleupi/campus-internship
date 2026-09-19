import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  NoSuchBucket,
  S3Client,
} from "@aws-sdk/client-s3";
import { readTestTargets } from "./test-targets";

// Jest `globalTeardown`: empties the dedicated test bucket after the run, so
// the objects the upload specs create don't accumulate (ADR-0030). Safe to
// empty wholesale because readTestTargets() guarantees this is a "-test"
// bucket that nothing but the e2e specs writes to.
export default async function globalTeardown(): Promise<void> {
  const { bucket } = readTestTargets();
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "fr-par",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

  try {
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
      );
      const keys = (page.Contents ?? []).flatMap((object) =>
        object.Key ? [{ Key: object.Key }] : [],
      );
      if (keys.length > 0) {
        await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys } }));
      }
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);
  } catch (error) {
    // No upload spec ran (or the bucket was never created): nothing to empty.
    if (!(error instanceof NoSuchBucket)) throw error;
  } finally {
    client.destroy();
  }
}
