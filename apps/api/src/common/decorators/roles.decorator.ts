import { SetMetadata } from "@nestjs/common";
import type { Role } from "shared";

export const ROLES_KEY = "roles";

// A route may require several roles; RolesGuard checks "has at least one of"
// (CLAUDE.md §5) — a single User can carry multiple roles (e.g. ADMIN + REFERENT).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
