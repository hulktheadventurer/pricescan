// pages/api/tracking/index.js

import dbConnect from '../../../lib/mongodb';
import Tracking from '../../../models/Tracking';

export default async function handler(req, res) {
  await dbConnect();

  if (req.method === 'GET') {
    try {
      // ✅ Sort by most recent update first
      const items = await Tracking.find({}).sort({ updatedAt: -1 });
      return res.status(200).json(items);
    } catch (err) {
      console.error('❌ Failed to fetch tracking items:', err);
      return res.status(500).json({ message: 'Failed to fetch items' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ message: 'Missing ID' });

    try {
      await Tracking.findByIdAndDelete(id);
      return res.status(200).json({ message: 'Deleted' });
    } catch (err) {
      console.error('❌ Failed to delete item:', err);
      return res.status(500).json({ message: 'Failed to delete item' });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}
