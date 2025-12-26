// app/api/cron/send-emails/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PriceScan <alerts@pricescan.ai>";

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY NOT SET — skipping email send");
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    }),
  });
}

/* -------------------- UTM HELPER -------------------- */
function withUtm(url: string, campaign: string) {
  const u = new URL(url);
  u.searchParams.set("utm_source", "pricescan");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

/* -------------------- PRICE DROP EMAIL -------------------- */
function buildPriceDropEmail(item: any, oldPrice: number, newPrice: number) {
  const diff = oldPrice - newPrice;
  const pct = (diff / oldPrice) * 100;

  const affiliateUrl = withUtm(
    getEbayAffiliateLink(item.url),
    "price_drop"
  );

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>📉 Price dropped!</h2>
    <p>Your tracked item just hit a new low:</p>

    <h3>${escape(item.title)}</h3>

    <p>
      Previous low: <b>${item.currency} ${oldPrice.toFixed(2)}</b><br/>
      New price: <b style="color:#16a34a;">${item.currency} ${newPrice.toFixed(2)}</b><br/>
      Difference: <b>${item.currency} ${diff.toFixed(2)} (-${pct.toFixed(1)}%)</b>
    </p>

    <a href="${affiliateUrl}"
       style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;
              border-radius:50px;text-decoration:none;font-weight:600;">
      View on eBay
    </a>

    <p style="margin-top:24px;font-size:12px;color:#999;">
      You are receiving this email because you track this item on PriceScan.
    </p>
  </div>`;
}

/* -------------------- RESTOCK EMAIL -------------------- */
function buildRestockEmail(item: any) {
  const affiliateUrl = withUtm(
    getEbayAffiliateLink(item.url),
    "restock"
  );

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>🔔 Back in stock!</h2>
    <p>Your tracked item is available again:</p>

    <h3>${escape(item.title)}</h3>

    <p>It was previously sold out, but it's now ACTIVE again.</p>

    <a href="${affiliateUrl}"
       style="display:inline-block;background:#16a34a;color:white;padding:10px 18px;
              border-radius:50px;text-decoration:none;font-weight:600;">
      View on eBay
    </a>

    <p style="margin-top:24px;font-size:12px;color:#999;">
      You are receiving this email because you track this item on PriceScan.
    </p>
  </div>`;
}

/* -------------------- HTML ESCAPE -------------------- */
function escape(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* -------------------- MAIN CRON -------------------- */
export async function GET() {
  const startedAt = new Date().toISOString();

  const { data: alerts, error: alertErr } = await supabaseAdmin
    .from("cron_alert_queue")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (alertErr) {
    console.error("❌ Failed to fetch cron_alert_queue:", alertErr);
    return NextResponse.json({ ok: false });
  }

  if (!alerts?.length)
    return NextResponse.json({ ok: true, startedAt, processed: 0 });

  let processed = 0;

  for (const alert of alerts) {
    try {
      const { data: product } = await supabaseAdmin
        .from("tracked_products")
        .select("id, title, url, user_id, status, sku")
        .eq("id", alert.product_id)
        .single();

      if (!product) continue;

      const { data: user, error: userErr } = await supabaseAdmin
        .from("auth.users")
        .select("email")
        .eq("id", product.user_id)
        .single();

      if (userErr || !user?.email) continue;

      if (alert.type === "PRICE_DROP") {
        const { data: snaps } = await supabaseAdmin
          .from("price_snapshots")
          .select("price, currency")
          .eq("product_id", product.id)
          .order("seen_at", { ascending: false });

        if (!snaps || snaps.length < 2) continue;

        const latest = snaps[0].price;
        const previousLow = Math.min(...snaps.slice(1).map((s) => s.price));

        if (latest < previousLow) {
          await sendEmail(
            user.email,
            `📉 Price dropped: ${product.title}`,
            buildPriceDropEmail(product, previousLow, latest)
          );
        }
      }

      if (alert.type === "RESTOCK") {
        await sendEmail(
          user.email,
          `🔔 Back in stock: ${product.title}`,
          buildRestockEmail(product)
        );
      }

      await supabaseAdmin
        .from("cron_alert_queue")
        .update({ processed: true })
        .eq("id", alert.id);

      processed++;
    } catch (err) {
      console.error("❌ Email processing error:", err);
    }
  }

  return NextResponse.json({ ok: true, startedAt, processed });
}
