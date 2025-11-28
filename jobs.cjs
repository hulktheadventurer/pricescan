require = require("module").createRequire(__filename);
const cron = require("node-cron");
const { exec } = require("child_process");



// Run eBay refresh every 60 minutes
cron.schedule("0 * * * *", () => {
  console.log("⏳ Refreshing eBay token...");
  exec(`node ebay-refresh-token.cjs`, (err, stdout, stderr) => {
    if (err) console.error("❌ Token refresh error:", err);
    else console.log(stdout);
  });
});

// Run price check every 3 hours
cron.schedule("0 */3 * * *", () => {
  console.log("🔎 Running price scan...");
  exec(`node check-prices.cjs`, (err, stdout, stderr) => {
    if (err) console.error("❌ Price scan error:", err);
    else console.log(stdout);
  });
});

console.log("✅ Jobs running... don't close this window.");
