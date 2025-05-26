// test-scrape.js
import { scrapeAmazonPrice } from './lib/scrapePrice.js';

const url = 'https://www.amazon.co.uk/dp/0306903512';

scrapeAmazonPrice(url).then(price => {
  console.log('💰 Price found:', price);
});
