// ebay-token-manager.cjs
require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const qs = require('querystring');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, 'ebay-token.json');

// Load .env values
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN;

// 🧠 Read existing token from file
function loadToken() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('⚠️ Failed to read token file:', err.message);
  }
  return {};
}

// 💾 Save token to file
function saveToken(data) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2));
  console.log('💾 Token saved to ebay-token.json');
}

// 🔄 Refresh access token if expired
async function refreshAccessToken() {
  console.log('🔄 Refreshing eBay access token...');

  const credentials = Buffer
    .from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`)
    .toString('base64');

  const body = qs.stringify({
    grant_type: 'refresh_token',
    refresh_token: EBAY_REFRESH_TOKEN,
    scope: 'https://api.ebay.com/oauth/api_scope' // ✅ ONLY VALID SCOPE
  });

  try {
    console.log('📤 Sending refresh request to eBay...');
    const response = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
      }
    );

    const tokenData = {
      access_token: response.data.access_token,
      // Store the expiry timestamp with a 1-minute safety buffer
      expires_in: Date.now() + (response.data.expires_in - 60) * 1000,
      refresh_token: EBAY_REFRESH_TOKEN,
    };

    saveToken(tokenData);
    console.log('✅ New access token received!');
    return tokenData.access_token;

  } catch (err) {
    console.error('❌ Error refreshing token:', err.response?.data || err.message);
    throw err;
  }
}

// 🔐 Get valid token (refresh if needed)
async function getAccessToken() {
  const token = loadToken();

  if (token.access_token && token.expires_in && Date.now() < token.expires_in) {
    return token.access_token;
  }

  console.log('⚠️ Token expired or missing, refreshing...');
  return await refreshAccessToken();
}

// 🧩 Export
module.exports = {
  getAccessToken,
  refreshAccessToken,
};
