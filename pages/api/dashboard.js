// pages/api/dashboard.js

import dbConnect from '../../lib/mongodb';
import Tracking from '../../models/Tracking';

export default async function handler(req, res) {
  await dbConnect();

  const { email } = req.query;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email', items: [] });
  }

  try {
    const items = await Tracking.find({ email }).sort({ updatedAt: -1 }).lean();

    console.log('📤 Returning items to frontend:', items.map(i => ({ url: i.url, price: i.price })));

    return res.status(200).json(items); // Always return an array
  } catch (err) {
    console.error('❌ Failed to fetch items:', err);
    return res.status(500).json({ message: 'Error fetching items', items: [] });
  }
}
