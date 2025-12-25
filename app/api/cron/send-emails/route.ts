import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "PriceScan <alerts@pricescan.ai>";

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY NOT SET — skipping email send");
    return;
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });

  if (!r.ok) {
    console.error("❌ Resend failed:", await r.text());
  }
}

/* -------------------- PRICE DROP EMAIL -------------------- */
function buildPriceDropEmail(item: any, oldPrice: number, newPrice: number) {
  const diff = oldPrice - newPrice;
  const pct = oldPrice > 0 ? (diff / oldPrice) * 100 : 0;
  const affiliateUrl = getEbayAffiliateLink(item.url);

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>📉 Price dropped!</h2>
    <p>Your tracked item just hit a new low:</p>

    <h3>${escapeHtml(item.title || "Tracked item")}</h3>

    <p>
      Previous low: <b>${item.currency || ""} ${oldPrice.toFixed(2)}</b><br/>
      New price: <b style="color:#16a34a;">${item.currency || ""} ${newPrice.toFixed(2)}</b><br/>
      Difference: <b>${item.currency || ""} ${diff.toFixed(2)} (-${pct.toFixed(1)}%)</b>
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
  const affiliateUrl = getEbayAffiliateLink(item.url);

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>🔔 Back in stock!</h2>
    <p>Your tracked item is available again:</p>

    <h3>${escapeHtml(item.title || "Tracked item")}</h3>

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

function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------- MAIN CRON -------------------- */
export async function GET() {
  const startedAt = new Date().toISOString();

  // 1) Get pending alerts
  const { data: alerts, error: alertErr } = await supabaseAdmin
    .from("cron_alert_queue")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (alertErr) {
    console.error("❌ Failed to fetch cron_alert_queue:", alertErr);
    return NextResponse.json({ ok: false, startedAt, error: alertErr.message }, { status: 500 });
  }

  if (!alerts?.length) return NextResponse.json({ ok: true, startedAt, processed: 0 });

  let processed = 0;

  for (const alert of alerts) {
    try {
      // 2) Product lookup
      const { data: product, error: prodErr } = await supabaseAdmin
        .from("tracked_products")
        .select("id, title, url, user_id")
        .eq("id", alert.product_id)
        .maybeSingle();

      if (prodErr || !product) {
        console.error("❌ Product lookup failed:", prodErr);
        continue;
      }

      // 3) User email via Supabase Admin API (reliable)
      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
        product.user_id
      );

      const email = userData?.user?.email || "";
      if (userErr || !email) {
        console.error("❌ User lookup failed:", userErr);
        continue;
      }

      // 4) Send based on type
      if (alert.type === "PRICE_DROP") {
        // Prefer stored old/new prices from queue
        let oldPrice = Number(alert.old_price);
        let newPrice = Number(alert.new_price);

        // Fallback: calculate from snapshots if missing
        if (!isFinite(oldPrice) || !isFinite(newPrice)) {
          const { data: snaps } = await supabaseAdmin
            .from("price_snapshots")
            .select("price, currency")
            .eq("product_id", product.id)
            .order("seen_at", { ascending: false });

          if (!snaps || snaps.length < 2) continue;

          newPrice = Number(snaps[0].price);
          oldPrice = Math.min(...snaps.slice(1).map((s: any) => Number(s.price)));
        }

        await sendEmail(
          email,
          `📉 Price dropped: ${product.title || "Tracked item"}`,
          buildPriceDropEmail(
            { ...product, currency: "GBP" },
            oldPrice,
            newPrice
          )
        );
      }

      if (alert.type === "RESTOCK") {
        await sendEmail(
          email,
          `🔔 Back in stock: ${product.title || "Tracked item"}`,
          buildRestockEmail(product)
        );
      }

      // 5) Mark processed
      await supabaseAdmin.from("cron_alert_queue").update({ processed: true }).eq("id", alert.id);

      processed++;
    } catch (err) {
      console.error("❌ Email processing error:", err);
    }
  }

  return NextResponse.json({ ok: true, startedAt, processed });
}
