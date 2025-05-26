// lib/runPriceCheck.js
import dbConnect from './mongodb.js';
import Tracking from '../models/Tracking.js';
import { scrapeAmazonPrice } from './scrapePrice.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// 🕒 Helper to wait 3–5 seconds between scrapes
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomDelay = () => delay(3000 + Math.random() * 2000); // 3–5s

export async function runPriceCheck() {
  console.log('🔍 Running daily price check...');

  await dbConnect();
  const entries = await Tracking.find({});
  const results = [];

  for (const entry of entries) {
    const { url, email } = entry;

    await randomDelay(); // ⏳ Random delay between requests

    const price = await scrapeAmazonPrice(url);

    if (!price) {
      results.push({ url, email, price: 'Not found', status: '❌ Price not found' });
      continue;
    }

    const hasChanged = price !== entry.latestPrice;
    entry.latestPrice = price;
    entry.lastChecked = new Date();
    await entry.save();

    if (hasChanged && email) {
      try {
        await resend.emails.send({
          from: process.env.ALERT_EMAIL_FROM,
          to: email,
          subject: '📉 Price Drop Detected!',
          html: `
            <h2>📉 Price Drop Detected</h2>
            <p>A product you're tracking has dropped in price:</p>
            <p><a href="${url}" target="_blank">${url}</a></p>
            <p>– Scanley the Owl 🦉 from PriceScan.ai</p>
          `,
        });
        results.push({ url, email, price, status: '✅ Alert Sent' });
      } catch {
        results.push({ url, email, price, status: '⚠️ Email failed' });
      }
    } else {
      results.push({ url, email, price, status: 'ℹ️ Price updated' });
    }
  }

  console.log('📊 Results:', results);
  return results; 
}
