import type { ArgumentsHost } from "@nestjs/common";
import { NoSuchBucket } from "@aws-sdk/client-s3";
import { S3ExceptionFilter } from "./s3-exception.filter";

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function s3Error(message: string) {
  return new NoSuchBucket({ $metadata: {}, message });
}

describe("S3ExceptionFilter", () => {
  let filter: S3ExceptionFilter;

  beforeEach(() => {
    filter = new S3ExceptionFilter();
  });

  it("translates any S3ServiceException into a generic 500, without leaking the raw AWS message", () => {
    const { host, status, json } = buildHost();

    filter.catch(s3Error("The specified bucket does not exist"), host);

    expect(status).toHaveBeenCalledWith(500);
    const [[payload]] = json.mock.calls as [[{ message: string }]];
    expect(payload.message).not.toContain("The specified bucket does not exist");
  });

  it("returns a French, user-facing message", () => {
    const { host, json } = buildHost();

    filter.catch(s3Error("boom"), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Une erreur est survenue lors de l'envoi du fichier." }),
    );
  });
});
