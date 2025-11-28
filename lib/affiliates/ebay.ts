// lib/affiliates/ebay.ts

/**
 * Turn a normal eBay product URL into an eBay Partner Network affiliate URL.
 * If env vars are missing or URL already has campid/mkcid, it returns the original URL.
 */
export function getEbayAffiliateLink(url: string) {
  if (!url) return url;

  const CAMPAIGN_ID = process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID;
  const CUSTOM_ID = process.env.NEXT_PUBLIC_EBAY_CUSTOM_ID;

  // If env not found, return raw URL so nothing breaks
  if (!CAMPAIGN_ID || !CUSTOM_ID) {
    console.warn("⚠️ EPN env vars missing, returning raw URL:", {
      CAMPAIGN_ID,
      CUSTOM_ID,
    });
    return url;
  }

  // Already affiliate-tagged? Don't double-add.
  if (url.includes("campid=") || url.includes("mkcid=")) {
    return url;
  }

  // Append params correctly whether or not there is already a query string
  const separator = url.includes("?") ? "&" : "?";

  const affUrl = `${url}${separator}mkcid=1&campid=${CAMPAIGN_ID}&customid=${encodeURIComponent(
    CUSTOM_ID
  )}`;

  // Optional debug log – safe to leave or remove
  console.log("🔗 eBay affiliate URL generated:", affUrl);

  return affUrl;
}
