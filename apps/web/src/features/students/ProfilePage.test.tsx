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

  it("shows both 'Remplacer' file buttons in read mode", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
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

  it("shows a confirmation dialog before replacing the insurance certificate on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    uploadInsuranceCertificateMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    const certificateInput = screen.getByTestId("insurance-certificate-input");
    const file = new File(["pdf-bytes"], "certificat.pdf", { type: "application/pdf" });
    await user.upload(certificateInput, file);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(uploadInsuranceCertificateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirmer/i }));

    await waitFor(() => expect(uploadInsuranceCertificateMock).toHaveBeenCalled());
    expect(uploadInsuranceCertificateMock.mock.calls[0]![0]).toBe(file);
  });

  it("never shows a confirmation dialog for an id photo replacement, even on a VALID profile", async () => {
    getProfileMock.mockResolvedValue(validProfile());
    uploadIdPhotoMock.mockResolvedValue(validProfile());
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: /^modifier$/i });
    const idPhotoInput = screen.getByTestId("id-photo-input");
    const file = new File(["png-bytes"], "photo.png", { type: "image/png" });
    await user.upload(idPhotoInput, file);

    await waitFor(() => expect(uploadIdPhotoMock).toHaveBeenCalled());
    expect(uploadIdPhotoMock.mock.calls[0]![0]).toBe(file);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
