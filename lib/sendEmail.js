import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTestAlert({ to, url }) {
  try {
    const data = await resend.emails.send({
      from: 'Scanley the Owl <alerts@pricescan.ai>', // friendly sender
      to,
      subject: '📉 Price Drop Detected!',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 1rem; line-height: 1.5; background: #fff; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #111;">📉 Price Drop Detected</h2>
          <p>Hi there,</p>
          <p>A product you're tracking has dropped in price:</p>
          <p>
            <a href="${url}" target="_blank" style="color: #1a73e8; font-weight: bold;">
              View Product on Amazon
            </a>
          </p>
          <hr style="margin-top: 2rem;" />
          <p style="font-size: 0.9rem; color: #666;">– Scanley the Owl 🦉 from PriceScan.ai</p>
        </div>
      `,
    });

    console.log('📬 Email sent:', data);
    return data;
  } catch (err) {
    console.error('❌ Email send failed:', err);
    throw err;
  }
}
