// pages/api/tracking/all.js

import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

// Consistent schema definition
const TrackingSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    email: { type: String, required: true },
    price: { type: String, default: '-' }, // Align with your DB field
    lastChecked: { type: Date, default: null },
  },
  { timestamps: true }
);

// Avoid model overwrite errors
const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Optional for dev testing

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    await dbConnect();

    const entries = await Tracking.find().sort({ createdAt: -1 });

    const formatted = entries.map(entry => ({
      url: entry.url,
      email: entry.email,
      latestPrice: entry.price || '-', // Use 'price' consistently
      lastChecked: entry.lastChecked,
    }));

    res.status(200).json(formatted);
  } catch (err) {
    console.error('❌ Error fetching entries:', err);
    res.status(500).json({ message: 'Error fetching tracking data' });
  }
}
