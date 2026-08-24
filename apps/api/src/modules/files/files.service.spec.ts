import { ConfigService } from "@nestjs/config";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    S3_REGION: "us-east-1",
    S3_BUCKET: "stages-files",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_FORCE_PATH_STYLE: true,
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService<Env, true>;
}

describe("FilesService", () => {
  beforeEach(() => {
    sendMock.mockClear();
    (S3Client as unknown as jest.Mock).mockClear();
  });

  it("configures the S3 client from env (endpoint, region, forcePathStyle, credentials)", () => {
    new FilesService(buildConfigService());

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        forcePathStyle: true,
        credentials: { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" },
      }),
    );
  });

  it("uploads a buffer with the given key and content type via PutObjectCommand", async () => {
    const service = new FilesService(buildConfigService());
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
});
