import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePage } from "./ProfilePage";

const getProfileMock = vi.fn();
const updateProfileMock = vi.fn();
const uploadIdPhotoMock = vi.fn();
const uploadInsuranceCertificateMock = vi.fn();

vi.mock("./api", () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
  updateProfile: (...args: unknown[]) => updateProfileMock(...args),
  uploadIdPhoto: (...args: unknown[]) => uploadIdPhotoMock(...args),
  uploadInsuranceCertificate: (...args: unknown[]) => uploadInsuranceCertificateMock(...args),
}));

function incompleteProfile() {
  return {
    promotion: null,
    phone: null,
    personalEmail: null,
    profileStatus: "INCOMPLETE",
    profileYear: null,
    files: [],
  };
}

function validProfile() {
  return {
    promotion: "L2",
    phone: "0601020304",
    personalEmail: "etu@gmail.com",
    profileStatus: "VALID",
    profileYear: "2025-2026",
    files: [
      { type: "ID_PHOTO", mimeType: "image/png", uploadedAt: "2026-01-01T00:00:00.000Z" },
      {
        type: "INSURANCE_CERTIFICATE",
        mimeType: "application/pdf",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function validProfileWithoutContact() {
  return {
    promotion: "L2",
    phone: null,
    personalEmail: null,
    profileStatus: "VALID",
    profileYear: "2025-2026",
    files: [
      { type: "ID_PHOTO", mimeType: "image/png", uploadedAt: "2026-01-01T00:00:00.000Z" },
      {
        type: "INSURANCE_CERTIFICATE",
        mimeType: "application/pdf",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function expiredProfile() {
  return {
    promotion: "L2",
    phone: "0601020304",
    personalEmail: "etu@gmail.com",
    profileStatus: "EXPIRED",
    profileYear: "2024-2025",
    files: [
      { type: "ID_PHOTO", mimeType: "image/png", uploadedAt: "2026-01-01T00:00:00.000Z" },
      {
        type: "INSURANCE_CERTIFICATE",
        mimeType: "application/pdf",
        uploadedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };
}

function partiallyIncompleteProfile() {
  return {
    promotion: "L2",
    phone: null,
    personalEmail: null,
    profileStatus: "INCOMPLETE",
    profileYear: null,
    files: [{ type: "ID_PHOTO", mimeType: "image/png", uploadedAt: "2026-01-01T00:00:00.000Z" }],
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    getProfileMock.mockReset();
    updateProfileMock.mockReset();
    uploadIdPhotoMock.mockReset();
    uploadInsuranceCertificateMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts in edit mode (form visible, no 'Modifier' button) when the profile is INCOMPLETE", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    expect(await screen.findByRole("button", { name: /enregistrer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^modifier$/i })).not.toBeInTheDocument();
  });

  it("starts read-only with a 'Modifier' button when the profile is VALID", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    expect(await screen.findByRole("button", { name: /^modifier$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enregistrer/i })).not.toBeInTheDocument();
  });

  it("shows no validation errors when entering edit mode with an unset phone/personalEmail on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfileWithoutContact());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    expect(screen.queryByText(/numéro de mobile français valide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid email/i)).not.toBeInTheDocument();
  });

  it("saves a VALID profile whose phone/personalEmail are still unset, without touching those fields", async () => {
    getProfileMock.mockResolvedValue(validProfileWithoutContact());
    updateProfileMock.mockResolvedValue(validProfileWithoutContact());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(updateProfileMock.mock.calls[0]![0]).toEqual({
      promotion: "L2",
      phone: null,
      personalEmail: null,
    });
  });

  it("does NOT show 'Remplacer' file buttons in read mode (single edit affordance for the whole page)", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    expect(screen.queryAllByText(/remplacer/i).length).toBe(0);
  });

  it("shows both 'Remplacer' file buttons after clicking the single 'Modifier' affordance", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    expect(screen.getAllByText(/remplacer/i).length).toBe(2);
  });

  it("shows both 'Remplacer' file buttons in edit mode too", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    expect(screen.getAllByText(/remplacer/i).length).toBe(2);
  });

  it("shows a confirmation dialog before regressing a VALID profile via a promotion change, and only applies it once confirmed", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    updateProfileMock.mockResolvedValue({ ...validProfile(), promotion: "L3" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    await user.selectOptions(screen.getByLabelText(/promotion/i), "L3");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(updateProfileMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmer/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(updateProfileMock.mock.calls[0]![0]).toEqual({
      promotion: "L3",
      phone: "0601020304",
      personalEmail: "etu@gmail.com",
    });
  });

  it("only allows digits and '+' to be typed into the phone field", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const phoneInput = screen.getByLabelText(/téléphone/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, "+33 (0)6 12a34-56b78");

    expect(phoneInput).toHaveValue("+330612345678");
  });

  it("does NOT show a confirmation dialog when only phone/personalEmail are edited on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    updateProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const phoneInput = screen.getByLabelText(/téléphone/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, "0611223344");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("resets the certificate consent checkbox after saving identity fields only, not just on cancel", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    updateProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    await user.click(screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }));
    const phoneInput = screen.getByLabelText(/téléphone/i);
    await user.clear(phoneInput);
    await user.type(phoneInput, "0611223344");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).not.toBeChecked();
  });

  it("shows a confirmation dialog before replacing the insurance certificate on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(uploadInsuranceCertificateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmer/i }));

    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());
    expect(uploadInsuranceCertificateMock.mock.calls[0]![0]).toBe(file);
  });

  it("labels the document 'attestation de responsabilité civile scolaire', not an abbreviated form", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    expect(
      await screen.findByText(/attestation de responsabilité civile scolaire/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/certificat d'assurance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/attestation d'assurance/i)).not.toBeInTheDocument();
  });

  it("shows a content checklist above the upload describing what the attestation must cover", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const checklist = screen.getByTestId("certificate-content-checklist");
    expect(checklist.textContent).toBe(
      "Votre document doit couvrir : vos stages et l'année scolaire en cours. Le document varie selon votre assureur, ce qui compte, c'est que ces deux points y figurent, peu importe la formulation exacte.",
    );
  });

  it("keeps the content checklist and its confirmation checkbox inside the documents section only", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const documentsHeading = screen.getByRole("heading", { name: /^documents$/i });
    const documentsSection = documentsHeading.closest("section") ?? documentsHeading.parentElement;
    expect(documentsSection?.contains(screen.getByTestId("certificate-content-checklist"))).toBe(
      true,
    );
    expect(
      documentsSection?.contains(
        screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
      ),
    ).toBe(true);
  });

  it("never disables the certificate upload — an unchecked confirmation checkbox blocks saving, not uploading", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(incompleteProfile());
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    const checkbox = screen.getByRole("checkbox", { name: /je confirme que mon attestation/i });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByTestId("insurance-certificate-input")).not.toBeDisabled();

    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());
  });

  it("blocks saving after a certificate upload until the confirmation checkbox is (re-)checked", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(incompleteProfile());
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);
    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: /enregistrer/i })).toBeDisabled();
    expect(screen.getByText(/confirmez que votre nouvelle attestation/i)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }));
    expect(screen.getByRole("button", { name: /enregistrer/i })).not.toBeDisabled();
  });

  it("does not block saving when no certificate was uploaded this session, even with the checkbox unchecked", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).not.toBeChecked();
    expect(screen.getByRole("button", { name: /enregistrer/i })).not.toBeDisabled();
  });

  it("resets the confirmation checkbox after a certificate upload, requiring re-confirmation next time", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(incompleteProfile());
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    const checkbox = screen.getByRole("checkbox", { name: /je confirme que mon attestation/i });
    await user.click(checkbox);
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).not.toBeChecked();
  });

  it("keeps the confirmation checkbox checked after a failed certificate upload, so retrying doesn't require re-confirming", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    uploadInsuranceCertificateMock.mockRejectedValue(new Error("network error"));
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    const checkbox = screen.getByRole("checkbox", { name: /je confirme que mon attestation/i });
    await user.click(checkbox);
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());
    expect(await screen.findByText(/une erreur est survenue/i)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).toBeChecked();
  });

  it("leaves the confirmation checkbox untouched when a VALID-profile certificate replacement is canceled — the candidate file was never adopted", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    await user.click(screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }));
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /annuler/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).toBeChecked();
    expect(uploadInsuranceCertificateMock).not.toHaveBeenCalled();
  });

  it("does not re-block saving when a later certificate replacement is canceled after an earlier one was already confirmed", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const fileA = new File(["pdf-bytes-a"], "certificat-a.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, fileA);
    await user.click(await screen.findByRole("button", { name: /confirmer/i }));
    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }));
    expect(screen.getByRole("button", { name: /enregistrer/i })).not.toBeDisabled();

    // Picks a different file, then backs out — certificate A stays live and already confirmed.
    const fileB = new File(["pdf-bytes-b"], "certificat-b.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, fileB);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /annuler/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /enregistrer/i })).not.toBeDisabled();
  });

  it("never shows a confirmation dialog for an id photo replacement, even on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    uploadIdPhotoMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));
    const idPhotoInput = screen.getByTestId("id-photo-input");
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await user.upload(idPhotoInput, file);

    await waitFor(() => expect(uploadIdPhotoMock).toHaveBeenCalled());
    expect(uploadIdPhotoMock.mock.calls[0]![0]).toBe(file);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("colors the status chip warning for an INCOMPLETE profile", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    const chip = await screen.findByTestId("profile-status-chip");
    expect(chip.className).toContain("MuiChip-colorWarning");
  });

  it("colors the status chip success (green) for a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    const chip = await screen.findByTestId("profile-status-chip");
    expect(chip.className).toContain("MuiChip-colorSuccess");
  });

  it("explains what's missing when the profile is INCOMPLETE", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    const alert = await screen.findByText(/votre profil est incomplet/i);
    expect(alert.textContent).toMatch(/complétez votre dossier/i);
    expect(alert.textContent).toMatch(/votre promotion/i);
    expect(alert.textContent).toMatch(/votre photo d'identité/i);
    expect(alert.textContent).toMatch(/votre attestation de responsabilité civile scolaire/i);
  });

  it("only lists the still-missing pieces, not the ones already provided", async () => {
    getProfileMock.mockResolvedValue(partiallyIncompleteProfile());
    renderPage();

    const alert = await screen.findByText(/votre profil est incomplet/i);
    expect(alert.textContent).not.toMatch(/votre promotion/i);
    expect(alert.textContent).not.toMatch(/votre photo d'identité/i);
    expect(alert.textContent).toMatch(/votre attestation de responsabilité civile scolaire/i);
  });

  it("starts in edit mode (form visible, no 'Modifier' button) when the profile is EXPIRED (BR-06)", async () => {
    getProfileMock.mockResolvedValue(expiredProfile());
    renderPage();

    expect(await screen.findByRole("button", { name: /enregistrer/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^modifier$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /annuler/i })).not.toBeInTheDocument();
  });

  it("shows the renewal alert (not the missing-items one) when the profile is EXPIRED (BR-06)", async () => {
    getProfileMock.mockResolvedValue(expiredProfile());
    renderPage();

    expect(await screen.findByText(/doit être renouvelé/i)).toBeInTheDocument();
    expect(screen.queryByText(/votre profil est incomplet/i)).not.toBeInTheDocument();
  });

  it("shows no explanatory alert when the profile is VALID", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    expect(screen.queryByText(/votre profil est incomplet/i)).not.toBeInTheDocument();
  });

  it("renders the page as two distinct sections, identity/contact and documents, under a single edit affordance", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    expect(await screen.findByRole("heading", { name: /identité.*contact/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^documents$/i })).toBeInTheDocument();
    // A single "Modifier" affordance for the whole page, not one per section.
    expect(screen.getAllByRole("button", { name: /^modifier$/i }).length).toBe(1);
  });

  it("switches both sections into edit mode together when the single 'Modifier' affordance is clicked", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));

    expect(screen.getByLabelText(/promotion/i)).toBeInTheDocument();
    expect(screen.getByTestId("certificate-content-checklist")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /je confirme que mon attestation/i }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^modifier$/i }).length).toBe(0);
  });

  it("shows a note that the personal email is also used for notifications, in the viewing state", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    expect(screen.getByText(/notifi/i)).toBeInTheDocument();
  });

  it("shows a note that the personal email is also used for notifications, in the editing state", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    renderPage();

    await screen.findByLabelText(/email personnel/i);
    expect(screen.getByText(/notifi/i)).toBeInTheDocument();
  });

  it("never uses the em dash character anywhere in the page's copy", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const { container } = renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    expect(container.textContent).not.toMatch(/—/);
  });

  it("never uses the em dash character anywhere in the page's copy while editing an incomplete profile", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    const { container } = renderPage();

    await screen.findByRole("button", { name: /enregistrer/i });
    expect(container.textContent).not.toMatch(/—/);
  });

  it("saves an INCOMPLETE profile's untouched phone/personalEmail as null, not the empty string rejected by the schema", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    updateProfileMock.mockResolvedValue({ ...incompleteProfile(), promotion: "L2" });
    const user = userEvent.setup();
    renderPage();

    // The form is already in edit mode on mount here (BR-06 forced edit) —
    // unlike a VALID profile, the phone/personalEmail TextFields exist from
    // the very first render, before react-hook-form's `values`-driven sync
    // has settled. Only `promotion` is touched; phone/personalEmail are left
    // exactly as seeded (empty).
    await user.selectOptions(await screen.findByLabelText(/promotion/i), "L2");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));

    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());
    expect(updateProfileMock.mock.calls[0]![0]).toEqual({
      promotion: "L2",
      phone: null,
      personalEmail: null,
    });
    expect(screen.queryByText(/numéro de mobile français valide/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/adresse email invalide/i)).not.toBeInTheDocument();
  });

  it("lets a student re-enter edit mode (Modifier) after saving identity fields on a still-INCOMPLETE profile", async () => {
    getProfileMock.mockResolvedValue(incompleteProfile());
    const updatedProfile = { ...incompleteProfile(), promotion: "L2" };
    updateProfileMock.mockResolvedValue(updatedProfile);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/promotion/i), "L2");
    await user.click(screen.getByRole("button", { name: /enregistrer/i }));
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalled());

    getProfileMock.mockResolvedValue(updatedProfile);
    expect(await screen.findByRole("button", { name: /^modifier$/i })).toBeInTheDocument();
  });

  it("clicking Modifier alone does not submit the form (the button swaps to a type=submit Enregistrer at the same position)", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /^modifier$/i }));

    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /enregistrer/i })).toBeInTheDocument();
  });
});
