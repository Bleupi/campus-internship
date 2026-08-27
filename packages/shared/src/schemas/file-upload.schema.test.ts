import { describe, expect, it } from "vitest";
import {
  ID_PHOTO_MIME_TYPES,
  INSURANCE_CERTIFICATE_MIME_TYPES,
  idPhotoMimeTypeSchema,
  insuranceCertificateMimeTypeSchema,
} from "./file-upload.schema";

describe("idPhotoMimeTypeSchema", () => {
  it("accepts every listed ID_PHOTO mime type", () => {
    for (const mimeType of ID_PHOTO_MIME_TYPES) {
      expect(idPhotoMimeTypeSchema.safeParse(mimeType).success).toBe(true);
    }
  });

  it("rejects a mime type not in the allowed list", () => {
    const result = idPhotoMimeTypeSchema.safeParse("application/pdf");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = idPhotoMimeTypeSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("insuranceCertificateMimeTypeSchema", () => {
  it("accepts every listed INSURANCE_CERTIFICATE mime type", () => {
    for (const mimeType of INSURANCE_CERTIFICATE_MIME_TYPES) {
      expect(insuranceCertificateMimeTypeSchema.safeParse(mimeType).success).toBe(true);
    }
  });

  it("rejects a mime type not in the allowed list", () => {
    const result = insuranceCertificateMimeTypeSchema.safeParse("image/png");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = insuranceCertificateMimeTypeSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});
