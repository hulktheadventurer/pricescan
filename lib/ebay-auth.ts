// lib/ebay-auth.ts (ENV-ONLY VERSION FOR VERCEL)

// eBay OAuth endpoints
const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";

// Required ENV variables (must be set in Vercel)
const EBAY_APP_ID = process.env.EBAY_APP_ID!;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID!;
const EBAY_REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN!;

// Scope required by eBay
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

// -----------------------------
// REFRESH TOKEN -> ACCESS TOKEN
// -----------------------------
export async function getValidAccessToken(): Promise<string> {
  console.log("🔄 Requesting fresh eBay access token from OAuth API...");

  const basicAuth = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: EBAY_REFRESH_TOKEN,
    scope: EBAY_SCOPE,
  });

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("❌ eBay OAuth FAILED:", data);
    throw new Error("Failed to get eBay access token");
  }

  console.log("✅ eBay access token generated");

  return data.access_token;
}
