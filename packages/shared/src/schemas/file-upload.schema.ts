import { z } from "zod";

// Single source of truth for allowed upload mime types per FileType — consumed
// by the API's Multer fileFilter and by the frontend's <input accept> so the
// two never drift (docs/dataModel.md § Files). File size limits stay out of
// this schema: Multer's fileFilter fires before the body stream is fully
// read, so file.size isn't reliably available at filter time — size is
// enforced separately via FileInterceptor's `limits.fileSize`.
export const ID_PHOTO_MIME_TYPES = ["image/jpeg", "image/png"] as const;
export const INSURANCE_CERTIFICATE_MIME_TYPES = ["application/pdf"] as const;

export const idPhotoMimeTypeSchema = z.enum(ID_PHOTO_MIME_TYPES);
export const insuranceCertificateMimeTypeSchema = z.enum(INSURANCE_CERTIFICATE_MIME_TYPES);
