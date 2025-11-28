// ebay-refresh-token.cjs
const fetch = require("node-fetch");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();

const {
  EBAY_APP_ID,
  EBAY_CERT_ID,
  EBAY_REFRESH_TOKEN,
} = process.env;

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";

// YOUR TOKEN WAS GENERATED WITH ONLY THIS SCOPE
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

async function refreshEbayToken() {
  console.log("🔄 Refreshing eBay access token...");

  if (!EBAY_REFRESH_TOKEN || EBAY_REFRESH_TOKEN.trim() === "") {
    console.error("❌ ERROR: EBAY_REFRESH_TOKEN is missing in .env");
    return null;
  }

  const basicAuth = Buffer.from(
    `${EBAY_APP_ID}:${EBAY_CERT_ID}`
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: EBAY_REFRESH_TOKEN,
    scope: EBAY_SCOPE, // 👈 FIXED
  });

  console.log("📤 Sending refresh request to eBay...");

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
    console.error("❌ Token refresh FAILED:");
    console.error(JSON.stringify(data, null, 2));
    return null;
  }

  fs.writeFileSync("ebay-token.json", JSON.stringify(data, null, 2));
  console.log("💾 Saved new token → ebay-token.json");

  if (data.access_token) {
    console.log("✔ New access token received.");
    console.log(`⏳ Expires in: ${data.expires_in} seconds`);
  }

  return data.access_token;
}

if (require.main === module) {
  refreshEbayToken();
}

module.exports = { refreshEbayToken };
