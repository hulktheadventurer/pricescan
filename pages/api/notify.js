// pages/api/notify.js

import { sendTestAlert } from '../../lib/sendEmail';


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, url } = req.body;

  if (!url || !email) {
    return res.status(400).json({ message: 'Missing email or URL' });
  }

  try {
    await sendTestAlert({ to: email, url });
    res.status(200).json({ message: '✅ Email sent!' });
  } catch (err) {
    res.status(500).json({ message: '❌ Failed to send email.' });
  }
}
