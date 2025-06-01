// scripts/runPriceCheck.js
import dotenv from 'dotenv';
dotenv.config();

import dbConnect from '../lib/mongodb.js';
import Tracking from '../models/Tracking.js';
import { scrapeAmazonPrice } from '../lib/scrapeAmazonPrice.js';

console.log('🔁 Running local price update...');
await dbConnect();

const items = await Tracking.find({});
if (!items.length) {
  console.log('📭 No items to check.');
  process.exit(0);
}

for (const item of items) {
  try {
    console.log(`🔍 Scraping ${item.url}`);
    const price = await scrapeAmazonPrice(item.url);
    if (price && price !== '-') {
      item.price = price; // ✅ must match schema
      item.lastChecked = new Date();
      await item.save();
      console.log(`✅ Updated: ${item.url} → ${price}`);
    } else {
      console.warn(`⚠️ No price found for ${item.url}`);
    }
  } catch (err) {
    console.error(`❌ Error updating ${item.url}:`, err.message);
  }
}

console.log('✅ Done.');
process.exit(0);
