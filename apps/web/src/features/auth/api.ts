import type {
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  MeResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
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

export function forgotPassword(dto: ForgotPasswordRequest) {
  return apiClient.post<ForgotPasswordResponse>("/auth/forgot-password", dto);
}

export function resetPassword(dto: ResetPasswordRequest) {
  return apiClient.post<ResetPasswordResponse>("/auth/reset-password", dto);
}

export function logout() {
  return apiClient.post<void>("/auth/logout", undefined);
}

export function getMe() {
  return apiClient.get<MeResponse>("/auth/me");
}
