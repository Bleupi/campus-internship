import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Env } from "../../config/env.schema";
import { FilesService } from "./files.service";

const sendMock = jest.fn().mockResolvedValue({});

jest.mock("@aws-sdk/client-s3", () => {
  const actualModule = jest.requireActual("@aws-sdk/client-s3");
  return {
    ...actualModule,
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  };
});

function buildConfigService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    S3_ENDPOINT: "http://localhost:9000",
    S3_REGION: "fr-par",
    S3_BUCKET: "stages-files",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_FORCE_PATH_STYLE: true,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService<Env, true>;
}

async function createFilesService(overrides: Record<string, unknown> = {}) {
  const module = await Test.createTestingModule({
    providers: [FilesService, { provide: ConfigService, useValue: buildConfigService(overrides) }],
  }).compile();
  // .compile() alone doesn't run Nest lifecycle hooks — .init() (inherited
  // from NestApplicationContext) is what actually triggers onModuleInit.
  await module.init();

  return module.get(FilesService);
}

describe("FilesService", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    sendMock.mockClear();
    sendMock.mockResolvedValue({});
    (S3Client as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("configures the S3 client from env (endpoint, region, forcePathStyle, credentials)", async () => {
    await createFilesService();

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:9000",
        region: "fr-par",
        forcePathStyle: true,
        credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      }),
    );
  });

  it("uploads a buffer with the given key and content type via PutObjectCommand", async () => {
    const service = await createFilesService();
    sendMock.mockClear(); // drop the HeadBucket call made during onModuleInit

    const body = Buffer.from("file-bytes");
    await service.upload("students/1/ID_PHOTO/abc", body, "image/png");

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: "stages-files",
      Key: "students/1/ID_PHOTO/abc",
      Body: body,
      ContentType: "image/png",
    });
  });

  it("streams a key's body via GetObjectCommand (issue #43: certificate proxy)", async () => {
    const service = await createFilesService();
    sendMock.mockClear(); // drop the HeadBucket call made during onModuleInit
    const body = Readable.from([Buffer.from("pdf-bytes")]);
    sendMock.mockResolvedValueOnce({ Body: body });

    const result = await service.download("students/1/INSURANCE_CERTIFICATE/abc");

    expect(result).toBe(body);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: "stages-files",
      Key: "students/1/INSURANCE_CERTIFICATE/abc",
    });
  });

  describe("onModuleInit (BR: bucket must exist before any upload is attempted)", () => {
    it("does nothing when HeadBucket succeeds (bucket already provisioned)", async () => {
      await createFilesService();

      expect(sendMock).toHaveBeenCalledTimes(1);
      const command = sendMock.mock.calls[0][0];
      expect(command).toBeInstanceOf(HeadBucketCommand);
      expect(command.input).toEqual({ Bucket: "stages-files" });
    });

    it("creates the bucket when HeadBucket reports it missing, outside production", async () => {
      process.env.NODE_ENV = "test";
      sendMock.mockImplementation((command) => {
        if (command instanceof HeadBucketCommand) {
          return Promise.reject(new NotFound({ $metadata: {}, message: "Not Found" }));
        }
        return Promise.resolve({});
      });

      await createFilesService();

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect(sendMock.mock.calls[1][0].input).toEqual({ Bucket: "stages-files" });
    });

    it("does not auto-create the bucket in production and lets the error propagate", async () => {
      process.env.NODE_ENV = "production";
      sendMock.mockImplementation((command) => {
        if (command instanceof HeadBucketCommand) {
          return Promise.reject(new NotFound({ $metadata: {}, message: "Not Found" }));
        }
        return Promise.resolve({});
      });

      await expect(createFilesService()).rejects.toThrow(NotFound);
      expect(sendMock).toHaveBeenCalledTimes(1); // only HeadBucket — CreateBucket never attempted
    });

    it("swallows a BucketAlreadyOwnedByYou race on CreateBucket", async () => {
      process.env.NODE_ENV = "test";
      sendMock.mockImplementation((command) => {
        if (command instanceof HeadBucketCommand) {
          return Promise.reject(new NotFound({ $metadata: {}, message: "Not Found" }));
        }
        if (command instanceof CreateBucketCommand) {
          return Promise.reject(new BucketAlreadyOwnedByYou({ $metadata: {}, message: "owned" }));
        }
        return Promise.resolve({});
      });

      await expect(createFilesService()).resolves.toBeInstanceOf(FilesService);
    });
  });
});
