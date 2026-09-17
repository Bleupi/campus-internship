interface OrganismAddress {
  structureType: string;
  street: string;
  postalCode: string;
  city: string;
}

export function formatOrganismAddress(organism: OrganismAddress) {
  return `${organism.structureType} · ${organism.street}, ${organism.postalCode} ${organism.city}`;
}

interface TutorContact {
  email: string;
  phone?: string | null;
  acceptsPhoneContact: boolean;
}

export function formatTutorContact(tutor: TutorContact) {
  return [
    tutor.email,
    tutor.phone,
    tutor.acceptsPhoneContact ? "accepte d'être contacté par téléphone" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
