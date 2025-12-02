// lib/ebay-auth.ts

let cache: { token: string; expires: number } | null = null;

export async function getEbayAccessToken() {
  const app = process.env.EBAY_APP_ID;
  const cert = process.env.EBAY_CERT_ID;
  const refresh = process.env.EBAY_REFRESH_TOKEN;

  if (!app || !cert || !refresh) {
    throw new Error("Missing eBay env vars");
  }

  const basic = Buffer.from(`${app}:${cert}`).toString("base64");

  // Return cached token if still good
  if (cache && cache.expires > Date.now() + 60_000) {
    return cache.token;
  }

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    console.error("eBay token refresh failed:", data);
    throw new Error("eBay access token refresh failed");
  }

  cache = {
    token: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}
