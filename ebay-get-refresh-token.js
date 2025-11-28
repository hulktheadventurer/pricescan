// ebay-refresh-token.cjs
const fetch = require("node-fetch");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const {
  EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET,
  EBAY_REFRESH_TOKEN,
} = process.env;

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";

// IMPORTANT — Must match EXACT scope of first token
const EBAY_SCOPE = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"
].join(" ");

async function refreshEbayToken() {
  console.log("🔄 Refreshing eBay access token...");

  if (!EBAY_REFRESH_TOKEN || EBAY_REFRESH_TOKEN.trim() === "") {
    console.error("❌ ERROR: EBAY_REFRESH_TOKEN is missing in .env");
    return null;
  }

  const basicAuth = Buffer
    .from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
    .toString("base64");

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
    console.error("❌ Token refresh failed:", data);
    return null;
  }

  fs.writeFileSync("ebay-token.json", JSON.stringify(data, null, 2));
  console.log("💾 Token saved to ebay-token.json");

  if (data.access_token) {
    console.log("✔ New access token received.");
  }

  return data.access_token;
}

// run manually
if (require.main === module) {
  refreshEbayToken();
}

module.exports = { refreshEbayToken };
