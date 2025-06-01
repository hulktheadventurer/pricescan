// pages/api/waitlist.js
import dbConnect from '../../lib/mongodb';
import Waitlist from '../../models/Waitlist';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    await dbConnect();

    const existing = await Waitlist.findOne({ email });
    if (existing) {
      return res.status(200).json({ alreadyJoined: true });
    }

    await Waitlist.create({ email });

    await resend.emails.send({
      from: process.env.ALERT_EMAIL_FROM,
      to: email,
      subject: '🎉 Welcome to the PriceScan Pro Waitlist',
      html: '<p>Thanks for joining the waitlist! You’ll be the first to know when Pro launches. 🦉</p>'
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Waitlist Error:', err);
    return res.status(500).json({ message: 'Failed to join waitlist.' });
  }
}
