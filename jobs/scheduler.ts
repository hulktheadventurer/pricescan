// ======================================================
// PriceScan Stage 14 – Auto Scheduler
// ======================================================
//
// Runs in background; executes fetcher every 3 h,
// alerts once a day at 08:30 AM (local time).
// Works both locally and in PM2/Render worker.
// ======================================================

import cron from "node-cron";
import { spawn } from "child_process";

function runJob(script: string) {
  console.log(`🚀 Launching job: ${script}`);
  const child = spawn("npm", ["run", script], { shell: true });
  child.stdout.on("data", (d) => process.stdout.write(d));
  child.stderr.on("data", (d) => process.stderr.write(d));
  child.on("close", (code) => console.log(`🏁 Job ${script} exited with code ${code}`));
}

// ---------------------------------------------
// every 3 hours – fetch new prices
// ---------------------------------------------
cron.schedule("0 */3 * * *", () => {
  runJob("job:fetcher");
});

// ---------------------------------------------
// every day at 08:30 AM – send alerts
// ---------------------------------------------
cron.schedule("30 8 * * *", () => {
  runJob("job:alerts");
});

// ---------------------------------------------
// keep alive
// ---------------------------------------------
console.log("🕓 Scheduler started. Fetcher every 3 h, alerts 08:30 AM daily.");
