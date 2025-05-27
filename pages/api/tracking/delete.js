import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

const TrackingSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    email: { type: String },
    price: { type: String, default: '-' },
    lastChecked: { type: Date, default: null },
  },
  { timestamps: true }
);

const Tracking = mongoose.models.Tracking || mongoose.model('Tracking', TrackingSchema);

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id) return res.status(400).json({ message: 'Missing tracking ID' });

  try {
    await dbConnect();
    const deleted = await Tracking.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Tracking item not found' });

    return res.status(200).json({ message: 'Deleted', deleted });
  } catch (err) {
    console.error('❌ Delete error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}
