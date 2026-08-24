import type { ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "./jwt-auth.guard";

function buildContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe("JwtAuthGuard", () => {
  it("allows the request through without checking the JWT when the route is @Public()", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    const superCanActivate = jest.spyOn(
      AuthGuard("jwt").prototype as unknown as { canActivate: () => boolean },
      "canActivate",
    );

    expect(guard.canActivate(buildContext())).toBe(true);
    expect(superCanActivate).not.toHaveBeenCalled();
  });

  it("delegates to the passport JWT strategy when the route is not @Public()", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new JwtAuthGuard(reflector);

    const superCanActivate = jest
      .spyOn(AuthGuard("jwt").prototype as unknown as { canActivate: () => boolean }, "canActivate")
      .mockReturnValue(true);

    const context = buildContext();
    expect(guard.canActivate(context)).toBe(true);
    expect(superCanActivate).toHaveBeenCalledWith(context);
  });
});
