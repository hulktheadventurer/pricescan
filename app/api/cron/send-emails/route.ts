// app/api/cron/send-emails/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  process.env.ALERT_FROM ||
  "PriceScan <alerts@pricescan.ai>";

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY NOT SET — skipping email send");
    return { ok: false, status: 0, error: "missing_resend_api_key" as const, details: "" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    console.error("❌ Resend send failed:", res.status, text);
    return {
      ok: false,
      status: res.status,
      error: `resend_failed_${res.status}` as const,
      details: text,
    };
  }

  console.log("✅ Email sent to:", to);
  return { ok: true as const, status: res.status, details: text };
}

/* -------------------- PRICE DROP EMAIL -------------------- */
function buildPriceDropEmail(item: any, oldPrice: number, newPrice: number) {
  const diff = oldPrice - newPrice;
  const pct = oldPrice ? (diff / oldPrice) * 100 : 0;
  const affiliateUrl = getEbayAffiliateLink(item.url);

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>📉 Price dropped!</h2>
    <p>Your tracked item just hit a new low:</p>

    <h3>${escapeHtml(item.title || "Tracked item")}</h3>

    <p>
      Previous low: <b>${item.currency || ""} ${Number(oldPrice).toFixed(2)}</b><br/>
      New price: <b style="color:#16a34a;">${item.currency || ""} ${Number(newPrice).toFixed(2)}</b><br/>
      Difference: <b>${item.currency || ""} ${Number(diff).toFixed(2)} (-${pct.toFixed(1)}%)</b>
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
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* -------------------- MAIN CRON -------------------- */
export async function GET(req: Request) {
  const startedAt = new Date().toISOString();
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const failures: Array<any> = [];

  const { data: alerts, error: alertErr } = await supabaseAdmin
    .from("cron_alert_queue")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (alertErr) {
    return NextResponse.json({ ok: false, startedAt, error: alertErr.message }, { status: 500 });
  }

  if (!alerts?.length) {
    return NextResponse.json({ ok: true, startedAt, processed: 0, emailed: 0, skipped: 0, note: "no_pending_alerts" });
  }

  let processed = 0;
  let emailed = 0;
  let skipped = 0;

  for (const alert of alerts) {
    const fail = (reason: string, extra: any = {}) => {
      skipped++;
      if (debug) failures.push({ alert_id: alert.id, type: alert.type, reason, ...extra });
    };

    try {
      const { data: product, error: prodErr } = await supabaseAdmin
        .from("tracked_products")
        .select("id, title, url, user_id, status, sku, merchant")
        .eq("id", alert.product_id)
        .maybeSingle();

      if (prodErr || !product) {
        fail("product_lookup_failed", { prodErr: prodErr?.message });
        continue;
      }

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(product.user_id);

      if (userErr) {
        fail("getUserById_failed", { userErr: String(userErr) });
        continue;
      }

      const email = userRes?.user?.email;
      if (!email) {
        fail("user_missing_email", { user_id: product.user_id });
        continue;
      }

      let sendRes: any = null;

      if (alert.type === "PRICE_DROP") {
        const oldP = Number(alert.old_price ?? NaN);
        const newP = Number(alert.new_price ?? NaN);
        if (!isFinite(oldP) || !isFinite(newP)) {
          fail("price_drop_missing_old_new", { old_price: alert.old_price, new_price: alert.new_price });
          continue;
        }
        sendRes = await sendEmail(
          email,
          `📉 Price dropped: ${product.title || "Tracked item"}`,
          buildPriceDropEmail(product, oldP, newP)
        );
      } else if (alert.type === "RESTOCK") {
        sendRes = await sendEmail(
          email,
          `🔔 Back in stock: ${product.title || "Tracked item"}`,
          buildRestockEmail(product)
        );
      } else {
        fail("unknown_alert_type", { got: alert.type });
        continue;
      }

      if (sendRes?.ok) {
        await supabaseAdmin.from("cron_alert_queue").update({ processed: true }).eq("id", alert.id);
        processed++;
        emailed++;
      } else {
        fail("email_send_failed", {
          from: EMAIL_FROM,
          resend_status: sendRes?.status,
          resend_error: sendRes?.error,
          resend_details: sendRes?.details,
        });
      }
    } catch (err: any) {
      fail("unexpected_exception", { message: err?.message || String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    processed,
    emailed,
    skipped,
    ...(debug ? { failures } : {}),
  });
}
