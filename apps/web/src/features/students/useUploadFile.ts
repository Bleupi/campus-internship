import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadIdPhoto, uploadInsuranceCertificate } from "./api";
import { STUDENT_PROFILE_QUERY_KEY } from "./query-keys";

export function useUploadIdPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadIdPhoto,
    onSuccess: (data) => {
      queryClient.setQueryData(STUDENT_PROFILE_QUERY_KEY, data);
    },
  });
}

export function useUploadInsuranceCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadInsuranceCertificate,
    onSuccess: (data) => {
      queryClient.setQueryData(STUDENT_PROFILE_QUERY_KEY, data);
    },
  });
}
