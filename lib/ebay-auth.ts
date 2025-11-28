// lib/ebay-auth.ts

import fs from "fs";
import path from "path";

const TOKEN_PATHS = [
  path.join(process.cwd(), "ebay-token.json"),
  path.join(process.cwd(), "..", "ebay-token.json"),
  path.resolve("ebay-token.json"),
];

const OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";

// Load environment variables
const EBAY_APP_ID = process.env.EBAY_APP_ID!;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID!;
const EBAY_REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN!;

// Basic scope (must match the original flow)
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";

/**
 * Find ebay-token.json file path
 */
function findTokenFile(): string {
  const file = TOKEN_PATHS.find((p) => fs.existsSync(p));
  if (!file) throw new Error("❌ Could not find ebay-token.json");
  return file;
}

/**
 * Load token from ebay-token.json
 */
export function loadStoredToken(): { access_token: string; expires_at: number } {
  const filePath = findTokenFile();
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!json.access_token) throw new Error("❌ access_token not found in token file");

  // Create expires_at field if missing
  if (!json.expires_at && json.expires_in) {
    json.expires_at = Date.now() + json.expires_in * 1000;
  }

  return json;
}

/**
 * Save token back to ebay-token.json
 */
function saveToken(data: any) {
  const filePath = findTokenFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log("💾 Saved refreshed token to ebay-token.json");
}

/**
 * Refresh access token using refresh_token
 */
export async function refreshAccessToken(): Promise<string> {
  console.log("🔄 Refreshing eBay access token...");

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
    console.error("❌ Refresh FAILED:", data);
    throw new Error("eBay refresh_token failed");
  }

  data.expires_at = Date.now() + data.expires_in * 1000;

  saveToken(data);

  return data.access_token;
}

/**
 * ALWAYS returns a valid access token:
 * - If token is fresh → return it
 * - If token expired → refresh it
 */
export async function getValidAccessToken(): Promise<string> {
  try {
    const tokenData = loadStoredToken();

    const expiresSoon = tokenData.expires_at < Date.now() + 2 * 60 * 1000; // 2-minute buffer

    if (expiresSoon) {
      console.log("⏳ Token expired or expiring soon — refreshing...");
      return await refreshAccessToken();
    }

    return tokenData.access_token;
  } catch (err) {
    console.warn("⚠️ Error loading token — refreshing", err);
    return await refreshAccessToken();
  }
}
