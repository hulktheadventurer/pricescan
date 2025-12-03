// lib/currency.ts

// Supported display currencies (keep this list relatively small for now)
export const SUPPORTED_CURRENCIES = [
  "GBP",
  "EUR",
  "USD",
  "CAD",
  "AUD",
  "BRL",
  "MXN",
  "PLN",
  "CZK",
  "SEK",
  "AED",
  "SAR",
  "ZAR",
  "TRY",
  "THB",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

// Rough static FX rates relative to 1 GBP
// ⚠️ These are approximate and should be refreshed occasionally
const TO_GBP: Record<CurrencyCode, number> = {
  GBP: 1,
  USD: 0.79,
  EUR: 0.86,
  CAD: 0.58,
  AUD: 0.53,
  BRL: 0.15,
  MXN: 0.04,
  PLN: 0.20,
  CZK: 0.035,
  SEK: 0.075,
  AED: 0.21,
  SAR: 0.21,
  ZAR: 0.043,
  TRY: 0.026,
  THB: 0.022,
};

export function isSupportedCurrency(code: string | null | undefined): code is CurrencyCode {
  if (!code) return false;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * Convert between two currencies using GBP as a pivot.
 * If either currency is unknown, falls back to the original amount.
 */
export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number {
  if (from === to) return amount;

  const fromRate = TO_GBP[from];
  const toRate = TO_GBP[to];

  if (!fromRate || !toRate) {
    return amount;
  }

  const inGbp = amount * fromRate;
  return inGbp / toRate;
}
