import dotenv from 'dotenv';
dotenv.config();

import dbConnect from '../../lib/mongodb';
import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema({
  url: { type: String, required: true },
  email: { type: String },
  price: { type: String, default: '-' },
  lastChecked: { type: Date, default: null },
}, { timestamps: true });

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  console.log('🔥🔥 /api/track endpoint HIT!');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { url, email } = req.body;

  console.log('📨 Received tracking request:', { email, url });

  if (!url || !url.includes('amazon')) {
    return res.status(400).json({ message: 'Invalid Amazon URL' });
  }

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    console.log('🔥 Entering try block in /api/track');
    await dbConnect();
    console.log('🛢️ Connected to DB:', mongoose.connection.name); // Confirm DB name

    const existingCount = await Tracking.countDocuments({ email });

    console.log(`🧮 User ${email} is tracking ${existingCount} items`);

    if (existingCount >= 5) {
      return res.status(403).json({ message: 'Tracking limit reached. Max 5 items allowed.' });
    }

    const newTracking = await Tracking.create({ url, email });
    console.log('📦 Tracking saved to DB:', newTracking);

    return res.status(200).json({ message: 'Tracking started!', tracking: newTracking });
  } catch (err) {
    console.error('❌ DB Error:', err);
    return res.status(500).json({ message: 'Failed to save tracking request.' });
  }
}
