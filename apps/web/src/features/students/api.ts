import type {
  GetProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UploadFileResponse,
} from "shared";
import { apiClient } from "../../lib/api-client";

export function getProfile() {
  return apiClient.get<GetProfileResponse>("/students/me/profile");
}

export function updateProfile(dto: UpdateProfileRequest) {
  return apiClient.patch<UpdateProfileResponse>("/students/me/profile", dto);
}

export function uploadIdPhoto(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.postForm<UploadFileResponse>("/students/me/profile/id-photo", formData);
}

export function uploadInsuranceCertificate(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.postForm<UploadFileResponse>(
    "/students/me/profile/insurance-certificate",
    formData,
  );
}
