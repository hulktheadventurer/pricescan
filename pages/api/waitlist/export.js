// pages/api/waitlist/export.js
import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

const WaitlistSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Waitlist = mongoose.models.Waitlist || mongoose.model('Waitlist', WaitlistSchema);

export default async function handler(req, res) {
  await dbConnect();

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const entries = await Waitlist.find({}).sort({ createdAt: -1 });
    return res.status(200).json(entries);
  } catch (err) {
    console.error('❌ Failed to export waitlist:', err);
    return res.status(500).json({ message: 'Failed to fetch waitlist' });
  }
}
