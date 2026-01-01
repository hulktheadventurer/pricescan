// lib/emails/priceDropEmail.ts
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PriceScan Alerts <alerts@pricescan.ai>";

interface PriceDropEmailParams {
  to: string;
  productTitle: string;
  productUrl: string;
  oldPrice: number;
  newPrice: number;
  currency: string;
  // ✅ new (passed from send-alerts)
  dropPercent?: number;
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

export async function sendPriceDropEmail(params: PriceDropEmailParams) {
  const {
    to,
    productTitle,
    productUrl,
    oldPrice,
    newPrice,
    currency,
    dropPercent,
  } = params;

  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY not set. Skipping email send.");
    return;
  }

  const affiliateUrl = getEbayAffiliateLink(productUrl);

  const safeTitle = escapeHtml(productTitle || "Tracked item");

  const oldText = formatMoney(oldPrice, currency);
  const newText = formatMoney(newPrice, currency);

  const diff = oldPrice - newPrice;
  const diffText = formatMoney(diff, currency);

  const pct =
    typeof dropPercent === "number" && Number.isFinite(dropPercent)
      ? dropPercent
      : oldPrice > 0
        ? (diff / oldPrice) * 100
        : 0;

  const pctText =
    Number.isFinite(pct) && pct > 0 ? `${pct.toFixed(1)}%` : null;

  // ✅ calmer, context-first subject (no emoji required)
  const subject = `PriceScan: Price change for "${productTitle || "your tracked item"}"`;

  // ✅ new positioning: “think & observe before buying”
  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; line-height: 1.5;">
      <h2 style="margin: 0 0 10px 0;">Your tracked item changed price</h2>

      <p style="margin: 0 0 14px 0; color: #374151;">
        PriceScan helps you <b>think and observe before buying</b> — by putting price changes into context.
      </p>

      <h3 style="margin: 14px 0 8px 0;">${safeTitle}</h3>

      <div style="margin: 10px 0 0 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <p style="margin: 0 0 6px 0;">
          <span style="color:#6b7280;">Previous price:</span>
          <b>${oldText}</b>
        </p>
        <p style="margin: 0 0 6px 0;">
          <span style="color:#6b7280;">Current price:</span>
          <b style="color:#16a34a;">${newText}</b>
        </p>
        <p style="margin: 0;">
          <span style="color:#6b7280;">Change:</span>
          <b>${diffText}${pctText ? ` (${pctText})` : ""}</b>
        </p>
      </div>

      <p style="margin: 14px 0; color:#374151;">
        Tip: A price drop doesn’t always mean a good deal — check the history before you decide.
      </p>

      <p style="margin: 16px 0;">
        <a
          href="${affiliateUrl}"
          style="
            display:inline-block;
            background:#2563eb;
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
      console.error("❌ Resend API error:", res.status, text);
    } else {
      console.log(`📧 Price drop email sent to ${to} for "${productTitle}"`);
    }
  } catch (err) {
    console.error("❌ Failed to send email via Resend:", err);
  }
}
