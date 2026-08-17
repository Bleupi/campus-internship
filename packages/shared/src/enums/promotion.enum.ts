export const PROMOTIONS = ["L2", "L3"] as const;

export type Promotion = (typeof PROMOTIONS)[number];
