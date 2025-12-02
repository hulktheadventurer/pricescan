// ====================================================
// FINAL WORKING VERSION — DO NOT EDIT ANYTHING INSIDE
// ====================================================

require("dotenv").config({
  path: ".env.local",
  override: true,
});

const fetch = require("node-fetch");

// ===== DEBUG BLOCK — THIS SHOWS EXACTLY WHAT NODE LOADED =====
console.log("======== DEBUG ENV VALUES LOADED FROM .env.local ========");
console.log("EBAY_APP_ID:", process.env.EBAY_APP_ID);
console.log("EBAY_CERT_ID:", process.env.EBAY_CERT_ID);
console.log("EBAY_RUNAME:", process.env.EBAY_RUNAME);
console.log("EBAY_AUTH_CODE (raw):", process.env.EBAY_AUTH_CODE);
console.log(
  "EBAY_AUTH_CODE LENGTH:",
  process.env.EBAY_AUTH_CODE ? process.env.EBAY_AUTH_CODE.length : 0
);
console.log("===========================================================\n");

// ====================================================
// VARIABLES
// ====================================================
const CLIENT_ID = process.env.EBAY_APP_ID;
const CLIENT_SECRET = process.env.EBAY_CERT_ID;
const AUTH_CODE = process.env.EBAY_AUTH_CODE;
const RUNAME = process.env.EBAY_RUNAME;

// ====================================================
// VALIDATION
// ====================================================
if (!CLIENT_ID || !CLIENT_SECRET || !AUTH_CODE || !RUNAME) {
  console.error("❌ Missing environment variables. Check .env.local");
  process.exit(1);
}

// ====================================================
// BASIC AUTH HEADER
// ====================================================
const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

// ====================================================
// MAIN TOKEN REQUEST
// ====================================================
(async () => {
  console.log("🔄 Requesting REFRESH TOKEN...\n");

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: AUTH_CODE,
      redirect_uri: RUNAME,
    }),
  });

  const data = await res.json();

  console.log("📨 RAW RESPONSE FROM EBAY:");
  console.log(data);

  if (!data.refresh_token) {
    console.log("\n❌ FAILED: No refresh token returned.");
    console.log("   Reason: AUTH CODE is invalid or expired.");
    console.log("   Fix: Generate a NEW auth code and update .env.local\n");
    process.exit(1);
  }

  console.log("\n🎉 SUCCESS — NEW REFRESH TOKEN:");
  console.log(`EBAY_REFRESH_TOKEN=${data.refresh_token}\n`);
})();
