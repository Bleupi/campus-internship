import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

function buildContext(user: { roles: string[] } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("allows the request when no @Roles() metadata is present on the route", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ roles: ["STUDENT"] }))).toBe(true);
  });

  it("allows the request when the user has at least one of the required roles", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["ADMIN", "REFERENT"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ roles: ["STUDENT", "REFERENT"] }))).toBe(true);
  });

  it("denies the request when the user has none of the required roles", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["ADMIN"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({ roles: ["STUDENT"] }))).toBe(false);
  });

  it("denies the request when there is no authenticated user on it", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["ADMIN"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });
});
