// pages/api/track.js
import dbConnect from '../../lib/mongodb';
import mongoose from 'mongoose';
import { scrapeAmazonPrice } from '../../lib/scrapeAmazonPrice';

const TrackingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  email: { type: String },
  price: { type: String, default: '-' },
  lastChecked: { type: Date, default: null },
}, { timestamps: true });

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { url, email } = req.body;
  if (!url || !url.includes('amazon')) {
    return res.status(400).json({ message: 'Invalid Amazon URL' });
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    await dbConnect();
    const existingCount = await Tracking.countDocuments({ email });
    if (existingCount >= 5) {
      return res.status(403).json({ message: 'Tracking limit reached. Max 5 items allowed.' });
    }

    const { data } = await axios.post('https://your-scraper-url.onrender.com/scrape', { url });
const price = data.price;

    const newTracking = await Tracking.create({
      url,
      email,
      price: price || '-',
      lastChecked: new Date()
    });

    return res.status(200).json({ message: 'Tracking started!', tracking: newTracking });
  } catch (err) {
    console.error('❌ Error during tracking:', err);
    return res.status(500).json({ message: 'Failed to save tracking request.' });
  }
}
