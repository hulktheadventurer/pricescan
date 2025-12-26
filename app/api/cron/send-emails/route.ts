// app/api/cron/send-emails/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "PriceScan <alerts@pricescan.ai>";

// Prefer NEXT_PUBLIC_BASE_URL so it works across envs (prod/preview/local)
const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  "https://pricescan.ai";

/* -------------------- EMAIL SENDER -------------------- */
async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY NOT SET — skipping email send");
    return { ok: false as const, status: 0, details: "missing_resend_api_key" };
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
    return { ok: false as const, status: res.status, details: text };
  }

  return { ok: true as const, status: res.status, details: text };
}

/* -------------------- HTML ESCAPE -------------------- */
function escapeHtml(str: string) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* -------------------- CLICK TRACK LINK -------------------- */
// Routes through your Next.js redirect endpoint (which logs to outbound_clicks)
function buildTrackedEbayLink(productId: string, campaign: string, source: string) {
  const u = new URL(`${BASE_URL.replace(/\/$/, "")}/go/ebay`);
  u.searchParams.set("product", productId);
  u.searchParams.set("campaign", campaign);
  u.searchParams.set("source", source);
  return u.toString();
}

/* -------------------- EMAIL TEMPLATES -------------------- */
function buildPriceDropEmail(item: any, oldPrice: number, newPrice: number) {
  const diff = oldPrice - newPrice;
  const pct = oldPrice ? (diff / oldPrice) * 100 : 0;

  // ✅ tracked click URL
  const viewUrl = buildTrackedEbayLink(item.id, "price_drop", "email");

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>📉 Price dropped!</h2>
    <p>Your tracked item just hit a new low:</p>

    <h3>${escapeHtml(item.title || "Tracked item")}</h3>

    <p>
      Previous low: <b>${item.currency || ""} ${Number(oldPrice).toFixed(2)}</b><br/>
      New price: <b style="color:#16a34a;">${item.currency || ""} ${Number(newPrice).toFixed(
        2
      )}</b><br/>
      Difference: <b>${item.currency || ""} ${Number(diff).toFixed(
        2
      )} (-${pct.toFixed(1)}%)</b>
    </p>

    <a href="${viewUrl}"
       style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;
              border-radius:50px;text-decoration:none;font-weight:600;">
      View on eBay
    </a>

    <p style="margin-top:24px;font-size:12px;color:#999;">
      You are receiving this email because you track this item on PriceScan.
    </p>
  </div>`;
}

function buildRestockEmail(item: any) {
  const viewUrl = buildTrackedEbayLink(item.id, "restock", "email");

  return `
  <div style="font-family: system-ui; padding:16px;">
    <h2>🔔 Back in stock!</h2>
    <p>Your tracked item is available again:</p>

    <h3>${escapeHtml(item.title || "Tracked item")}</h3>

    <p>It was previously sold out, but it's now ACTIVE again.</p>

    <a href="${viewUrl}"
       style="display:inline-block;background:#16a34a;color:white;padding:10px 18px;
              border-radius:50px;text-decoration:none;font-weight:600;">
      View on eBay
    </a>

    <p style="margin-top:24px;font-size:12px;color:#999;">
      You are receiving this email because you track this item on PriceScan.
    </p>
  </div>`;
}

/* -------------------- MAIN CRON -------------------- */
export async function GET() {
  const startedAt = new Date().toISOString();
  const failures: any[] = [];

  // 1) Get pending alerts
  const { data: alerts, error: alertErr } = await supabaseAdmin
    .from("cron_alert_queue")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (alertErr) {
    console.error("❌ Failed to fetch cron_alert_queue:", alertErr);
    return NextResponse.json(
      { ok: false, startedAt, error: alertErr.message },
      { status: 500 }
    );
  }

  if (!alerts?.length) {
    return NextResponse.json({
      ok: true,
      startedAt,
      processed: 0,
      emailed: 0,
      skipped: 0,
      failures: [],
    });
  }

  let processed = 0;
  let emailed = 0;
  let skipped = 0;

  for (const alert of alerts) {
    try {
      // Product lookup
      const { data: product, error: prodErr } = await supabaseAdmin
        .from("tracked_products")
        .select("id, title, url, user_id, status, sku, merchant")
        .eq("id", alert.product_id)
        .maybeSingle();

      if (prodErr || !product) {
        skipped++;
        failures.push({
          alert_id: alert.id,
          type: alert.type,
          reason: "product_lookup_failed",
          details: prodErr?.message || "missing_product",
        });
        continue;
      }

      // User lookup via Admin API (correct)
      const { data: userRes, error: userErr } =
        await supabaseAdmin.auth.admin.getUserById(product.user_id);

      if (userErr) {
        skipped++;
        failures.push({
          alert_id: alert.id,
          type: alert.type,
          reason: "getUserById_failed",
          details: String(userErr),
        });
        continue;
      }

      const email = userRes?.user?.email;
      if (!email) {
        skipped++;
        failures.push({
          alert_id: alert.id,
          type: alert.type,
          reason: "user_missing_email",
          details: product.user_id,
        });
        continue;
      }

      // Build + send
      let sendRes: any = null;

      if (alert.type === "PRICE_DROP") {
        const oldP = Number(alert.old_price ?? NaN);
        const newP = Number(alert.new_price ?? NaN);

        if (!isFinite(oldP) || !isFinite(newP)) {
          skipped++;
          failures.push({
            alert_id: alert.id,
            type: alert.type,
            reason: "missing_old_new_price_on_alert",
          });
          continue;
        }

        sendRes = await sendEmail(
          email,
          `📉 Price dropped: ${product.title || "Tracked item"}`,
          buildPriceDropEmail(product, oldP, newP)
        );
      }

      if (alert.type === "RESTOCK") {
        sendRes = await sendEmail(
          email,
          `🔔 Back in stock: ${product.title || "Tracked item"}`,
          buildRestockEmail(product)
        );
      }

      // Only mark processed if email actually succeeded
      if (sendRes?.ok) {
        await supabaseAdmin
          .from("cron_alert_queue")
          .update({ processed: true })
          .eq("id", alert.id);

        processed++;
        emailed++;
      } else {
        skipped++;
        failures.push({
          alert_id: alert.id,
          type: alert.type,
          reason: "email_send_failed",
          from: EMAIL_FROM,
          resend_status: sendRes?.status,
          resend_details: sendRes?.details,
        });
      }
    } catch (err: any) {
      skipped++;
      failures.push({
        alert_id: alert?.id,
        type: alert?.type,
        reason: "unhandled_exception",
        details: String(err?.message || err),
      });
    }
  }

  return NextResponse.json({ ok: true, startedAt, processed, emailed, skipped, failures });
}
