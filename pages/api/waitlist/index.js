// pages/api/waitlist/index.js
import dbConnect from '../../../lib/mongodb';
import WaitlistEntry from '../../../models/WaitlistEntry';

export default async function handler(req, res) {
  await dbConnect();

  if (req.method === 'GET') {
    const { pass } = req.query;
    if (!pass || pass !== process.env.NEXT_PUBLIC_ADMIN_PASS) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    try {
      const entries = await WaitlistEntry.find().sort({ createdAt: -1 });
      res.status(200).json(entries);
    } catch (err) {
      console.error('❌ Failed to fetch waitlist:', err);
      res.status(500).json({ message: 'Failed to fetch waitlist' });
    }
  } else {
    res.status(405).json({ message: 'Method Not Allowed' });
  }
}
