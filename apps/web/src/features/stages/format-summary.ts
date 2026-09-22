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

// Periods are calendar dates stored as UTC midnight, so they are formatted in
// UTC: local-time formatting would shift them a day for a browser west of it.
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

export function formatPeriodRange(period: { startDate: string; endDate: string }) {
  return `${formatDate(period.startDate)} → ${formatDate(period.endDate)}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// BR-04c allows `endDate === startDate` (a one-day period), so both bounds are
// inclusive: a period's length is the day count from start to end, plus one.
export function formatTotalDuration(periods: { startDate: string; endDate: string }[]) {
  const totalDays = periods.reduce((sum, period) => {
    const days = Math.round(
      (Date.parse(period.endDate) - Date.parse(period.startDate)) / MS_PER_DAY,
    );
    return sum + days + 1;
  }, 0);
  return totalDays <= 1 ? `${totalDays} jour` : `${totalDays} jours`;
}
