import type { z } from "zod";
import type { Role } from "../enums";
import type { loginSchema } from "../schemas/login.schema";
import type { signupSchema } from "../schemas/signup.schema";

export type SignupRequest = z.infer<typeof signupSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
}

export interface SignupResponse {
  user: AuthUser;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

export type RefreshResponse = MeResponse;
