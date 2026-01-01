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

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export async function sendRestockEmail(params: RestockEmailParams) {
  const { to, productTitle, productUrl, latestPrice, currency } = params;

  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY not set. Skipping restock email.");
    return;
  }

  const affiliateUrl = getEbayAffiliateLink(productUrl);
  const safeTitle = escapeHtml(productTitle || "Tracked item");

  const prettyPrice =
    typeof latestPrice === "number" &&
    Number.isFinite(latestPrice) &&
    currency
      ? formatMoney(latestPrice, currency)
      : null;

  // ✅ calmer subject, consistent with PriceDrop
  const subject = `PriceScan: Back in stock — "${productTitle || "your tracked item"}"`;

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; line-height: 1.5;">
      <h2 style="margin: 0 0 10px 0;">Back in stock</h2>

      <p style="margin: 0 0 14px 0; color: #374151;">
        Your tracked item is available again. If you're still interested, take a calm look and decide.
      </p>

      <h3 style="margin: 14px 0 8px 0;">${safeTitle}</h3>

      ${
        prettyPrice
          ? `
          <div style="margin: 10px 0 0 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <p style="margin: 0;">
              <span style="color:#6b7280;">Current price:</span>
              <b>${prettyPrice}</b>
            </p>
          </div>
        `
          : ""
      }

      <p style="margin: 14px 0; color:#374151;">
        Tip: PriceScan is designed to help you <b>think and observe before buying</b> — check the price history if you're unsure.
      </p>

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
