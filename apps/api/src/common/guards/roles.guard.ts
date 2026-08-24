import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "shared";
import { ROLES_KEY } from "../decorators/roles.decorator";

// Not exercised by any route in issue #10 yet — scaffolded per CLAUDE.md §5,
// ready for the first role-restricted endpoint (e.g. admin-only routes).
@Injectable()
export class RolesGuard {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { roles: Role[] } }>();
    const user = request.user;

    // "At least one of" (CLAUDE.md §5) — a User can carry multiple roles.
    return !!user && user.roles.some((role) => requiredRoles.includes(role));
  }
}
