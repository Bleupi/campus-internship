import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { Strategy } from "passport-jwt";
import type { Role } from "shared";
import type { Env } from "../../../config/env.schema";

export function cookieExtractor(req: Request): string | null {
  return req?.cookies?.access_token ?? null;
}

interface JwtPayload {
  sub: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService<Env, true>) {
    // Read into a local first — inlining configService.get(...) directly as
    // an object-literal property lets passport-jwt's `secretOrKey: string |
    // Buffer` type contextually interfere with ConfigService's overload
    // resolution (TS picks the wrong overload and infers `never`).
    const jwtSecret = configService.get("JWT_SECRET", { infer: true });
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      roles: payload.roles,
    };
  }
}
