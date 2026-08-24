import type {
  LoginRequest,
  LoginResponse,
  MeResponse,
  SignupRequest,
  SignupResponse,
} from "shared";
import { apiClient } from "../../lib/api-client";

export function signup(dto: SignupRequest) {
  return apiClient.post<SignupResponse>("/auth/signup", dto);
}

export function login(dto: LoginRequest) {
  return apiClient.post<LoginResponse>("/auth/login", dto);
}

export function logout() {
  return apiClient.post<void>("/auth/logout", undefined);
}

export function getMe() {
  return apiClient.get<MeResponse>("/auth/me");
}
