// ======================================================
// PriceScan Stage 12 – Alerts + Digest Job
// ======================================================
//
// 1. Reads recent price_snapshots and users’ preferences
// 2. Detects price drops compared with previous snapshot
// 3. Sends instant or digest emails via Resend
// ======================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

// ------------------------------------------------------
// 1️⃣  Clients
// ------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = new Resend(process.env.RESEND_API_KEY!);

// ------------------------------------------------------
// 2️⃣  Constants
// ------------------------------------------------------
const DROP_THRESHOLD_PERCENT = 3; // notify if price drops ≥3%
const DIGEST_LIMIT = 10;          // items per digest email

// ------------------------------------------------------
// 3️⃣  Helpers
// ------------------------------------------------------
async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ RESEND_API_KEY not set — skipping email send");
    return;
  }
  await resend.emails.send({
    from: "PriceScan <alerts@pricescan.ai>",
    to,
    subject,
    html,
  });
}

function buildInstantHTML(title: string, oldPrice: number, newPrice: number, url: string) {
  const drop = (((oldPrice - newPrice) / oldPrice) * 100).toFixed(1);
  return `
    <h2>💰 Price Drop Alert</h2>
    <p><strong>${title}</strong></p>
    <p>Old price: £${oldPrice.toFixed(2)}<br>
       New price: <strong>£${newPrice.toFixed(2)}</strong> (↓${drop}%)</p>
    <p><a href="${url}">View product</a></p>
  `;
}

function buildDigestHTML(items: any[]) {
  const list = items
    .map(
      (i) => `<li><a href="${i.url}">${i.title}</a> — <strong>£${i.price.toFixed(
        2
      )}</strong></li>`
    )
    .join("");
  return `
    <h2>📰 Your PriceScan Digest</h2>
    <ul>${list}</ul>
    <p>Thank you for using PriceScan!</p>
  `;
}

// ------------------------------------------------------
// 4️⃣  Detect and queue instant alerts
// ------------------------------------------------------
async function processInstantAlerts() {
  console.log("🔎 Checking for price drops...");

  const { data: snapshots, error } = await supabase
    .from("price_snapshots")
    .select("*, tracked_products(title, user_id, canonical_url)")
    .gte("seen_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("seen_at", { ascending: false });

  if (error) throw error;
  if (!snapshots?.length) {
    console.log("✅ No recent price changes.");
    return;
  }

  for (const snap of snapshots) {
    const watchId = snap.watch_id;
    const title = snap.tracked_products?.title;
    const userId = snap.tracked_products?.user_id;
    const url = snap.tracked_products?.canonical_url;

    // Find previous snapshot for comparison
    const { data: prev } = await supabase
      .from("price_snapshots")
      .select("price")
      .eq("watch_id", watchId)
      .lt("seen_at", snap.seen_at)
      .order("seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prev) continue;
    const oldPrice = parseFloat(prev.price);
    const newPrice = parseFloat(snap.price);
    const drop = ((oldPrice - newPrice) / oldPrice) * 100;

    if (drop >= DROP_THRESHOLD_PERCENT) {
      console.log(`💸 Price drop detected for ${title} (${drop.toFixed(1)}%)`);

      const { data: user } = await supabase
        .from("users")
        .select("email, is_email_muted")
        .eq("id", userId)
        .single();

      if (!user || user.is_email_muted) continue;

      const html = buildInstantHTML(title, oldPrice, newPrice, url);
      await sendEmail(user.email, `Price drop: ${title}`, html);

      await supabase.from("notifications").insert({
        watch_id: watchId,
        kind: "price_drop",
        payload: { oldPrice, newPrice, drop },
        status: "sent",
      });
    }
  }

  console.log("✅ Instant alert pass complete.");
}

// ------------------------------------------------------
// 5️⃣  Build daily digests
// ------------------------------------------------------
async function processDailyDigests() {
  console.log("📬 Building daily digests...");

  const { data: users } = await supabase
    .from("users")
    .select("id, email, digest_frequency, is_email_muted")
    .eq("digest_frequency", "daily")
    .eq("is_email_muted", false);

  if (!users?.length) return console.log("✅ No digest subscribers.");

  for (const user of users) {
    const { data: changes } = await supabase
      .from("price_snapshots")
      .select("*, tracked_products(title, canonical_url)")
      .gte("seen_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(DIGEST_LIMIT);

    if (!changes?.length) continue;

    const items = changes.map((c) => ({
      title: c.tracked_products?.title,
      url: c.tracked_products?.canonical_url,
      price: parseFloat(c.price),
    }));

    const html = buildDigestHTML(items);
    await sendEmail(user.email, "Your PriceScan Daily Digest", html);

    await supabase.from("notifications").insert({
      watch_id: null,
      kind: "digest",
      payload: { count: items.length },
      status: "sent",
    });
  }

  console.log("✅ Daily digests sent.");
}

// ------------------------------------------------------
// 6️⃣  Run everything
// ------------------------------------------------------
(async () => {
  console.log("🚀 Starting alerts job...");

  try {
    await processInstantAlerts();
    await processDailyDigests();
    console.log("🏁 Alerts job complete.");
  } catch (err: any) {
    console.error("❌ Alerts job failed:", err.message);
  }
})();
