import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../../config/env.schema";
import { JwtStrategy, cookieExtractor } from "./jwt.strategy";

describe("cookieExtractor", () => {
  it("reads the JWT from the access_token cookie", () => {
    const req = { cookies: { access_token: "the-jwt" } };
    expect(cookieExtractor(req as never)).toBe("the-jwt");
  });

  it("returns null when there is no access_token cookie", () => {
    expect(cookieExtractor({ cookies: {} } as never)).toBeNull();
    expect(cookieExtractor({} as never)).toBeNull();
  });
});

describe("JwtStrategy", () => {
  it("maps a verified JWT payload onto req.user (sub -> id)", () => {
    const configService = {
      get: jest.fn().mockReturnValue("a-secret-at-least-32-characters-long"),
    } as unknown as ConfigService<Env, true>;
    const strategy = new JwtStrategy(configService);

    const result = strategy.validate({
      sub: "user-id-123",
      email: "etu@u-pariscite.fr",
      firstName: "Étu",
      lastName: "Dupont",
      roles: ["STUDENT"],
    });

    expect(result).toEqual({
      id: "user-id-123",
      email: "etu@u-pariscite.fr",
      firstName: "Étu",
      lastName: "Dupont",
      roles: ["STUDENT"],
    });
  });
});
