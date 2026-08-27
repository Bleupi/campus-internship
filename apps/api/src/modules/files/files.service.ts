import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  HeadBucketCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Env } from "../../config/env.schema";

// Thin S3-compatible object-store wrapper (ADR-0020): same client works
// against MinIO locally (S3_ENDPOINT/S3_FORCE_PATH_STYLE) and any
// S3-compatible provider (e.g. Scaleway) in prod.
@Injectable()
export class FilesService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService<Env, true>) {
    // Read into locals first — inlining configService.get(...) directly as
    // an S3ClientConfig object-literal property lets that property's own
    // union type contextually interfere with ConfigService's overload
    // resolution (same TS quirk as jwt.strategy.ts).
    const endpoint = configService.get("S3_ENDPOINT", { infer: true });
    const region = configService.get("S3_REGION", { infer: true });
    const forcePathStyle = configService.get("S3_FORCE_PATH_STYLE", { infer: true });
    const accessKeyId = configService.get("S3_ACCESS_KEY_ID", { infer: true });
    const secretAccessKey = configService.get("S3_SECRET_ACCESS_KEY", { infer: true });
    const bucket = configService.get("S3_BUCKET", { infer: true });
    this.bucket = bucket;

    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // MinIO (unlike AWS S3/Scaleway in prod) starts with no buckets
  // provisioned, and nothing else in local dev/CI creates one
  // (docker-compose.yml has no init step) — so uploads would otherwise fail
  // with an uncaught NoSuchBucket. Auto-creation is skipped in production:
  // the app shouldn't hold CreateBucket IAM rights there, so a missing prod
  // bucket fails loud at boot instead of being silently created.
  async onModuleInit(): Promise<void> {
    let headError: unknown;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!(error instanceof NotFound)) {
        throw error;
      }
      headError = error;
    }

    if (process.env.NODE_ENV === "production") {
      throw headError;
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      // Two instances racing to create the bucket at boot — the bucket
      // exists either way, nothing to do.
      if (!(error instanceof BucketAlreadyOwnedByYou)) {
        throw error;
      }
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}
