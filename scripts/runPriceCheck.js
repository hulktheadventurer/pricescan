// scripts/runPriceCheck.js
import { runPriceCheck } from '../lib/runPriceCheck.js';

(async () => {
  try {
    const results = await runPriceCheck();
    console.log('✅ Manual price check complete.');
    results.forEach(r => console.log(`${r.status} ${r.url} — ${r.price}`));
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
