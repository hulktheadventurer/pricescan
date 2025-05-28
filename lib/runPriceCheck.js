import mongoose from 'mongoose';
import dbConnect from '../lib/mongodb.js';
import { scrapeAmazonPrice } from './scrapeAmazonPrice.js';
import { sendEmail } from './sendEmail.js';
import dotenv from 'dotenv';
dotenv.config();

await dbConnect();
const Tracking = (await import('../models/Tracking.js')).default;

export async function runPriceCheck() {
  console.log('🔍 Running daily price check...');
  const trackedItems = await Tracking.find({});

  const results = [];

  for (const item of trackedItems) {
    const price = await scrapeAmazonPrice(item.url);
    const oldPrice = item.price;

    item.price = price;
    item.lastChecked = new Date();
    await item.save();

    results.push({ url: item.url, price, status: price !== '-' ? '✅' : '⚠️' });

    if (price !== '-' && oldPrice !== '-' && price < oldPrice && item.email) {
      await sendEmail(
        item.email,
        '📉 Price Drop Alert!',
        `<p>The item you’re tracking has dropped in price!</p><p><a href="${item.url}">${item.url}</a></p><p>Old Price: ${oldPrice}<br>New Price: ${price}</p>`
      );
    }
  }

  return results;
}
