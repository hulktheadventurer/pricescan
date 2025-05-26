import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema({
  url: String,
  email: String,
  price: String,
  lastChecked: Date,
}, { timestamps: true });

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { id } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid ID' });
  }

  try {
    await dbConnect();
    const deleted = await Tracking.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: 'Item not found' });
    }

    return res.status(200).json({ message: 'Item deleted' });
  } catch (err) {
    console.error('❌ Deletion error:', err);
    return res.status(500).json({ message: 'Failed to delete item' });
  }
}
