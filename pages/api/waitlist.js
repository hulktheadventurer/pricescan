// pages/api/waitlist.js
import dbConnect from '../../lib/mongodb';
import mongoose from 'mongoose';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const WaitlistSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  joinedAt: { type: Date, default: Date.now }
});

const Waitlist = mongoose.models.Waitlist || mongoose.model('Waitlist', WaitlistSchema);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    await dbConnect();

    const existing = await Waitlist.findOne({ email });
    if (existing) return res.status(200).json({ message: 'Already joined the waitlist' });

    await Waitlist.create({ email });

    await resend.emails.send({
      from: process.env.ALERT_EMAIL_FROM,
      to: email,
      subject: '🎉 Welcome to the PriceScan Pro Waitlist',
      html: '<p>Thanks for joining the waitlist! You’ll be the first to know when Pro launches. 🦉</p>'
    });

    res.status(200).json({ message: 'Successfully joined waitlist' });
  } catch (err) {
    console.error('❌ Waitlist error:', err);
    res.status(500).json({ message: 'Failed to join waitlist' });
  }
}
