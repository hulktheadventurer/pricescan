// lib/emails/restockEmail.ts
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PriceScan Alerts <alerts@pricescan.ai>";

interface RestockEmailParams {
  to: string;
  productTitle: string;
  productUrl: string;
  latestPrice?: number | null;
  currency?: string | null;
}

export async function sendRestockEmail(params: RestockEmailParams) {
  const { to, productTitle, productUrl, latestPrice, currency } = params;

  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY not set. Skipping restock email.");
    return;
  }

  const affiliateUrl = getEbayAffiliateLink(productUrl);

  const prettyPrice =
    latestPrice != null && currency
      ? `${currency} ${latestPrice.toFixed(2)}`
      : null;

  const subject = `✅ Back in stock: ${productTitle}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;">
      <h2 style="margin-bottom: 8px;">It's back in stock!</h2>
      <p style="margin: 0 0 8px 0;">
        An item you were tracking on <b>PriceScan</b> is available again on eBay.
      </p>

      <h3 style="margin: 16px 0 8px 0;">${escapeHtml(productTitle)}</h3>

      ${
        prettyPrice
          ? `<p style="margin: 0 0 4px 0;">Current price: <b>${prettyPrice}</b></p>`
          : ""
      }

      <p style="margin: 16px 0;">
        <a 
          href="${affiliateUrl}" 
          style="
            display:inline-block;
            background:#16a34a;
            color:#ffffff;
            padding:10px 18px;
            border-radius:999px;
            text-decoration:none;
            font-weight:600;
          "
        >
          View on eBay
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
      console.error("❌ Resend API (restock) error:", res.status, text);
    } else {
      console.log(`📧 Restock email sent to ${to} for "${productTitle}"`);
    }
  } catch (err) {
    console.error("❌ Failed to send restock email via Resend:", err);
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
