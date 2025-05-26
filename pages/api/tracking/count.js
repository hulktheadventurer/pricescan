// pages/api/tracking/count.js

import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

// Define schema only once across hot reloads
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
  res.setHeader('Access-Control-Allow-Origin', '*'); // Optional: Allow any origin for frontend requests

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email } = req.query;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }

  try {
    await dbConnect();
    const count = await Tracking.countDocuments({ email });
    return res.status(200).json({ count });
  } catch (err) {
    console.error('❌ Error counting entries:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
