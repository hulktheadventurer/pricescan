const { searchEbay } = require("./ebay-api.cjs");

(async () => {
  try {
    console.log("🔍 Searching eBay for 'iphone'...");
    const results = await searchEbay("iphone");
    console.log("✅ Search results:");
    console.log(results);
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
})();
