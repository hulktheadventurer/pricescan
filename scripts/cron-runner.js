// scripts/cron-runner.js
import dotenv from 'dotenv';
dotenv.config();

import dbConnect from '../lib/mongodb.js';
import Tracking from '../models/Tracking.js';
import { scrapeAmazonPrice } from '../lib/scrapeAmazonPrice.js';

(async () => {
  await dbConnect();
  const items = await Tracking.find();

  console.log(`📅 Starting daily scrape: ${items.length} items`);

  for (const item of items) {
    try {
      const price = await scrapeAmazonPrice(item.url);
      item.latestPrice = price;
      item.lastChecked = new Date();
      await item.save();
      console.log(`✅ Updated ${item.url}`);
    } catch (err) {
      console.error(`❌ Failed to update ${item.url}: ${err.message}`);
    }
  }

  process.exit();
})();
