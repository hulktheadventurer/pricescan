// pages/api/tracking/all.js

import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    email: { type: String, required: true },
    price: { type: String, default: '-' },
    lastChecked: { type: Date, default: null },
  },
  { timestamps: true }
);

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();

    const entries = await Tracking.find().sort({ createdAt: -1 });

    const formatted = entries.map(entry => ({
      _id: entry._id.toString(), // ✅ include this
      url: entry.url,
      email: entry.email,
      latestPrice: entry.price || '-',
      lastChecked: entry.lastChecked,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('❌ Error fetching entries:', err);
    res.status(500).json({ message: 'Error fetching tracking data' });
  }
}
