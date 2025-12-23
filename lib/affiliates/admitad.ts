// lib/affiliates/admitad.ts

export const ADMITAD_ALIEXPRESS_BASE =
  "https://rzekl.com/g/1e8d1144940e8bbbb3bf16525dc3e8/";

export function admitadDeeplink(base: string, destinationUrl: string) {
  const cleanBase = base.endsWith("/") ? base : base + "/";
  const sep = cleanBase.includes("?") ? "&" : "?";
  return `${cleanBase}${sep}ulp=${encodeURIComponent(destinationUrl)}`;
}

export function buildAliExpressAffiliateUrl(destinationUrl: string) {
  return admitadDeeplink(ADMITAD_ALIEXPRESS_BASE, destinationUrl);
}
