// lib/emails/soldOutEmail.ts
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PriceScan Alerts <alerts@pricescan.ai>";

interface SoldOutEmailParams {
  to: string;
  productTitle: string;
  productUrl: string;
}

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendSoldOutEmail(params: SoldOutEmailParams) {
  const { to, productTitle, productUrl } = params;

  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY not set. Skipping sold-out email.");
    return;
  }

  const affiliateUrl = getEbayAffiliateLink(productUrl);
  const safeTitle = escapeHtml(productTitle || "Tracked item");

  // ✅ calm, neutral subject
  const subject = `PriceScan: Listing ended — "${productTitle || "your tracked item"}"`;

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; line-height: 1.5;">
      <h2 style="margin: 0 0 10px 0;">Listing ended</h2>

      <p style="margin: 0 0 14px 0; color: #374151;">
        The item you were tracking is no longer available on eBay.
      </p>

      <h3 style="margin: 14px 0 8px 0;">${safeTitle}</h3>

      <p style="margin: 14px 0; color:#374151;">
        This can happen when a listing sells out or reaches its end date.
        If you’re still interested, you may want to look for similar listings.
      </p>

      <p style="margin: 16px 0;">
        <a
          href="${affiliateUrl}"
          style="
            display:inline-block;
            background:#6b7280;
            color:#ffffff;
            padding:10px 18px;
            border-radius:999px;
            text-decoration:none;
            font-weight:600;
          "
        >
          View listing (if still visible)
        </a>
      </p>

      <p style="margin-top:24px; font-size:12px; color:#6b7280;">
        You received this email because you asked PriceScan to track this product.
      </p>
    </div>
  `;

  const payload = {
    from: EMAIL_FROM,
    to,
    subject,
    html,
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("❌ Resend API (sold-out) error:", res.status, text);
    } else {
      console.log(`📧 Sold-out email sent to ${to} for "${productTitle}"`);
    }
  } catch (err) {
    console.error("❌ Failed to send sold-out email via Resend:", err);
  }
}
