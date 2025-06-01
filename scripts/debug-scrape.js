import { scrapeAmazonPrice } from '../lib/scrapeAmazonPrice.js';

const testUrl = 'https://www.amazon.co.uk/dp/1734346450';

(async () => {
  const price = await scrapeAmazonPrice(testUrl);
  console.log('✅ Final price result:', price);
})();
