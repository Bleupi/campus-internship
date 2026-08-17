export const FILE_TYPES = ["ID_PHOTO", "INSURANCE_CERTIFICATE"] as const;

export type FileType = (typeof FILE_TYPES)[number];
