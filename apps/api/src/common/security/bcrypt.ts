// bcrypt cost factor for every password hash the API writes (signup, reset,
// ADR-0031's unusable referent hash), the seed and test fixtures — one
// setting, so a bump never leaves a stray hash on the old cost.
export const BCRYPT_ROUNDS = 10;
