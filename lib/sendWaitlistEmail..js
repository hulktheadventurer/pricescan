// lib/sendWaitlistEmail.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWaitlistConfirmation(email) {
  return resend.emails.send({
    from: process.env.ALERT_EMAIL_FROM,
    to: email,
    subject: '🎉 You’re on the PriceScan Pro Waitlist!',
    html: `
      <h2>Thanks for joining the waitlist!</h2>
      <p>We're working on PriceScan Pro — with more tracking slots, instant alerts, and premium support.</p>
      <p>You’ll be the first to know when we launch.</p>
      <br/>
      <p>🦉 Stay sharp,<br/>The PriceScan.ai Team</p>
    `,
  });
}
