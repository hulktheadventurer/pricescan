import dotenv from 'dotenv';
dotenv.config();

import { runPriceCheck } from './lib/runPriceCheck.js';

console.log('🕓 Starting Railway hosted price check...');
runPriceCheck()
  .then(() => {
    console.log('✅ Price check completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Price check failed:', err);
    process.exit(1);
  });
