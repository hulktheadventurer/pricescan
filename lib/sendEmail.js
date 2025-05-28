import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export async function sendEmail(to, subject, html) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.ALERT_EMAIL_USER,
      pass: process.env.ALERT_EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: `"PriceScan" <${process.env.ALERT_EMAIL_USER}>`,
    to,
    subject,
    html
  });
}
export async function sendTestAlert({ to, url }) {
  return sendEmail(
    to,
    'Test Price Alert',
    `<p>This is a test email for the URL you provided:</p><p><a href="${url}">${url}</a></p>`
  );
}
