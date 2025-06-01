// pages/api/tracking/[id].js
import dbConnect from '../../../lib/mongodb';
import Tracking from '../../../models/Tracking';

export default async function handler(req, res) {
  await dbConnect();

  const { id } = req.query;

  if (req.method === 'DELETE') {
    try {
      const deleted = await Tracking.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({ message: 'Item not found' });
      }
      return res.status(200).json({ message: 'Item deleted' });
    } catch (error) {
      return res.status(500).json({ message: 'Server error', error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method Not Allowed' });
  }
}
