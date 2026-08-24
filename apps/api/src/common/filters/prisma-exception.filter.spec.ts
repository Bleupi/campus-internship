import type { ArgumentsHost } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("raw prisma driver detail", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

describe("PrismaExceptionFilter", () => {
  let filter: PrismaExceptionFilter;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
  });

  it("translates P2002 (unique constraint on email) into 409 with a domain-specific message", () => {
    const { host, status, json } = buildHost();

    filter.catch(prismaError("P2002", { target: ["email"] }), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Un compte existe déjà avec cette adresse email" }),
    );
  });

  it("translates P2002 on a non-email field into a generic 409 conflict message", () => {
    const { host, status, json } = buildHost();

    filter.catch(prismaError("P2002", { target: ["label"] }), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Cette ressource existe déjà" }),
    );
  });

  it("translates P2025 (record not found) into 404", () => {
    const { host, status } = buildHost();

    filter.catch(prismaError("P2025"), host);

    expect(status).toHaveBeenCalledWith(404);
  });

  it("translates P2003 (foreign key constraint failed) into 400", () => {
    const { host, status } = buildHost();

    filter.catch(prismaError("P2003"), host);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("falls back to a generic 500 for any other Prisma error code, without leaking the raw driver message", () => {
    const { host, status, json } = buildHost();

    filter.catch(prismaError("P2028"), host);

    expect(status).toHaveBeenCalledWith(500);
    const [[payload]] = json.mock.calls as [[{ message: string }]];
    expect(payload.message).not.toContain("raw prisma driver detail");
  });
});
