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
