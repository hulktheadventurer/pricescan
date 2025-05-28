// pages/api/check-prices.js

import dbConnect from '../../lib/mongodb';
import Tracking from '../../models/Tracking';
import { scrapeAmazonPrice } from '../../lib/scrapePrice';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();
    const entries = await Tracking.find({});
    const results = [];

    for (const entry of entries) {
      const { url, email } = entry;

      try {
        const price = await scrapeAmazonPrice(url);
        entry.latestPrice = price || 'Not found';
        entry.lastChecked = new Date();
        await entry.save();

        const status = price === 'Not found'
          ? '❌ Price not found'
          : '✅ Price updated';

        results.push({ url, email, price, status });

      } catch (err) {
        console.error(`❌ Error updating entry for ${url}:`, err.message);
        results.push({ url, email, price: null, status: '⚠️ Scrape failed' });
      }
    }

    return res.status(200).json({
      message: '✅ Daily price check complete.',
      results,
    });

  } catch (err) {
    console.error('❌ Critical error in check-prices API:', err.message);
    return res.status(500).json({ message: '❌ Server Error', error: err.message });
  }
}
