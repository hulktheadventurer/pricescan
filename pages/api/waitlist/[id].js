// pages/api/waitlist/[id].js
import dbConnect from '../../../lib/mongodb';
import mongoose from 'mongoose';

const WaitlistSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Waitlist = mongoose.models.Waitlist || mongoose.model('Waitlist', WaitlistSchema);

export default async function handler(req, res) {
  await dbConnect();

  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      const deleted = await Waitlist.findByIdAndDelete(id);
      if (!deleted) return res.status(404).json({ message: 'Entry not found' });
      return res.status(200).json({ message: 'Deleted' });
    } catch (err) {
      return res.status(500).json({ message: 'Delete failed' });
    }
  } else {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
}
