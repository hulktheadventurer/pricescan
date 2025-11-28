// ebay-api.cjs
require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Paths
const TOKEN_FILE = path.join(__dirname, "ebay-token.json");

// Affiliate tracking
const EPN_CAMPAIGN_ID = process.env.EBAY_CAMPAIGN_ID || "5339128964";
const EPN_CUSTOM_ID = process.env.EBAY_CUSTOM_ID || "PriceScan";

// Load access token from file
function loadTokenFromFile() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    return data.access_token || null;
  } catch (e) {
    console.error("❌ Failed reading ebay-token.json:", e);
    return null;
  }
}

// Save refreshed token to file
function saveToken(data) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("❌ Failed writing ebay-token.json:", e);
  }
}

// Use your working refresh script
async function refreshToken() {
  console.log("🔄 FORCING TOKEN REFRESH (ebay-api)...");
  const { refreshEbayToken } = require("./ebay-refresh-token.cjs");
  const newToken = await refreshEbayToken();
  if (!newToken) throw new Error("Failed to refresh token.");
  return newToken;
}

// Request wrapper with auto-refresh
async function ebayRequest(endpoint, params = {}) {
  let token = loadTokenFromFile();

  if (!token) {
    console.log("⚠️ No token found, refreshing...");
    token = await refreshToken();
  }

  const url = `https://api.ebay.com${endpoint}`;

  try {
    const response = await axios.get(url, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (err) {
    const status = err.response?.status;

    // expired or invalid → retry once
    if (status === 401 || status === 403) {
      console.log("⚠️ Token expired. Refreshing and retrying…");

      token = await refreshToken();

      const retry = await axios.get(url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      return retry.data;
    }

    console.error("❌ eBay API error:", err.response?.data || err.message);
    throw new Error("eBay API request failed");
  }
}

// Search
async function searchEbay(keyword) {
  const data = await ebayRequest(`/buy/browse/v1/item_summary/search`, {
    q: keyword,
    limit: 5,
  });

  return (data.itemSummaries || []).map((item) => {
    const baseUrl = item.itemWebUrl || "";
    const trackedUrl = baseUrl.includes("?")
      ? `${baseUrl}&campid=${EPN_CAMPAIGN_ID}&customid=${EPN_CUSTOM_ID}`
      : `${baseUrl}?campid=${EPN_CAMPAIGN_ID}&customid=${EPN_CUSTOM_ID}`;

    return {
      title: item.title,
      price: item.price?.value,
      currency: item.price?.currency,
      itemId: item.itemId,
      link: trackedUrl,
    };
  });
}

module.exports = { ebayRequest, searchEbay };
