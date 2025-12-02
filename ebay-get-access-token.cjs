// ebay-get-access-token.cjs (CommonJS version)
// Works with Node 22 and .cjs ecosystem

const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Load .env.local
dotenv.config({ path: ".env.local", override: true });

// Debug output
console.log("======== ACCESS TOKEN DEBUG ========");
console.log("EBAY_APP_ID:", process.env.EBAY_APP_ID);
console.log("EBAY_CERT_ID:", process.env.EBAY_CERT_ID);
console.log("EBAY_REFRESH_TOKEN length:", process.env.EBAY_REFRESH_TOKEN?.length);
console.log("====================================\n");

// Validate required env vars
const REQUIRED = ["EBAY_APP_ID", "EBAY_CERT_ID", "EBAY_REFRESH_TOKEN"];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const CLIENT_ID = process.env.EBAY_APP_ID;
const CLIENT_SECRET = process.env.EBAY_CERT_ID;
const REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN;

// eBay token endpoint
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";

// Prepare request body
const params = new URLSearchParams();
params.append("grant_type", "refresh_token");
params.append("refresh_token", REFRESH_TOKEN);
params.append("scope", "https://api.ebay.com/oauth/api_scope");

// Prepare Basic auth
const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

console.log("🔄 Requesting ACCESS TOKEN...\n");

(async () => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json();

  console.log("📨 RAW RESPONSE FROM EBAY:");
  console.log(data);

  // Validate
  if (!data.access_token) {
    console.error("\n❌ FAILED: No access token returned. Check refresh token.");
    process.exit(1);
  }

  const newAccessToken = data.access_token;

  // Update .env.local
  const envPath = path.resolve(".env.local");
  let envContent = fs.readFileSync(envPath, "utf8");

  // Replace EBAY_ACCESS_TOKEN= line
  envContent = envContent.replace(
    /^EBAY_ACCESS_TOKEN=.*/m,
    `EBAY_ACCESS_TOKEN="${newAccessToken}"`
  );

  fs.writeFileSync(envPath, envContent, "utf8");

  console.log("\n🎉 SUCCESS — NEW ACCESS TOKEN SAVED TO .env.local");
  console.log("EBAY_ACCESS_TOKEN=", newAccessToken);
  console.log("Expires in:", data.expires_in, "seconds\n");
})();
