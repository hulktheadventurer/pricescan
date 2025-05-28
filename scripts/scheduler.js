// scripts/scheduler.js
import cron from 'node-cron';
import { runPriceCheck } from '../lib/runPriceCheck.js';

console.log('⏰ Scheduler started. Waiting for next run...');

cron.schedule('0 10 * * *', async () => {
  console.log('🕒 Daily cron job started...');
  try {
    const results = await runPriceCheck();
    results.forEach(r => console.log(`${r.status} ${r.url} — ${r.price}`));
  } catch (err) {
    console.error('❌ Cron job error:', err.message);
  }
});
