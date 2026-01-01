// app/api/cron/send-alerts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendPriceDropEmail } from "@/lib/emails/priceDropEmail";
import { sendRestockEmail } from "@/lib/emails/restockEmail";
import { sendSoldOutEmail } from "@/lib/emails/soldOutEmail";

type AlertType = "PRICE_DROP" | "RESTOCK" | "SOLD_OUT";

interface AlertRow {
  id: string;
  user_id: string;
  product_id: string;
  alert_type: AlertType;
  old_price: number | null;
  new_price: number | null;
  currency: string | null;
  created_at: string;
}

function pctDrop(oldPrice: number, newPrice: number) {
  if (!Number.isFinite(oldPrice) || oldPrice <= 0) return 0;
  return ((oldPrice - newPrice) / oldPrice) * 100;
}

export async function GET() {
  const startedAt = new Date().toISOString();

  // 1) Fetch pending alerts
  const { data: alerts, error } = await supabaseAdmin
    .from("cron_alert_queue")
    .select("id, user_id, product_id, alert_type, old_price, new_price, currency, created_at")
    .is("processed_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("❌ cron_alert_queue fetch error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return NextResponse.json({ ok: true, startedAt, processed: 0 });
  }

  const typedAlerts = alerts as AlertRow[];

  // 2) Fetch product info in one query
  const productIds = Array.from(new Set(typedAlerts.map((a) => a.product_id)));

  const { data: products, error: prodErr } = await supabaseAdmin
    .from("tracked_products")
    .select("id, title, url, merchant")
    .in("id", productIds);

  if (prodErr) {
    console.error("❌ tracked_products fetch error:", prodErr);
  }

  const productMap: Record<string, { id: string; title: string; url: string; merchant: string | null }> = {};
  (products || []).forEach((p: any) => {
    productMap[p.id] = {
      id: p.id,
      title: p.title || "Tracked product",
      url: p.url,
      merchant: p.merchant ?? null,
    };
  });

  // 3) Fetch user emails (cache per user_id)
  const userEmailCache: Record<string, string | null> = {};

  async function getUserEmail(userId: string): Promise<string | null> {
    if (userEmailCache[userId] !== undefined) return userEmailCache[userId];

    try {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);

      if (error || !data?.user) {
        console.error("❌ getUserById error:", error);
        userEmailCache[userId] = null;
        return null;
      }

      const email = data.user.email ?? null;
      userEmailCache[userId] = email;
      return email;
    } catch (err) {
      console.error("❌ auth.admin.getUserById failed:", err);
      userEmailCache[userId] = null;
      return null;
    }
  }

  const successIds: string[] = [];
  const errorUpdates: { id: string; error: string }[] = [];

  // 4) Process each alert row
  for (const alert of typedAlerts) {
    const product = productMap[alert.product_id];

    if (!product) {
      console.warn("⚠️ Missing product for alert", alert.id, alert.product_id);
      errorUpdates.push({ id: alert.id, error: "Missing product in tracked_products" });
      continue;
    }

    const email = await getUserEmail(alert.user_id);
    if (!email) {
      console.warn("⚠️ Missing email for user", alert.user_id);
      errorUpdates.push({ id: alert.id, error: "Missing user email" });
      continue;
    }

    try {
      const safeCurrency = alert.currency || "GBP";

      if (alert.alert_type === "PRICE_DROP") {
        if (alert.old_price == null || alert.new_price == null) {
          throw new Error("Missing old/new price for PRICE_DROP alert");
        }

        const dropPct = pctDrop(alert.old_price, alert.new_price);

        await sendPriceDropEmail({
          to: email,
          productTitle: product.title,
          productUrl: product.url,
          oldPrice: alert.old_price,
          newPrice: alert.new_price,
          currency: safeCurrency,
          dropPercent: dropPct, // ✅ new field we’ll use in the email copy
        });
      }

      if (alert.alert_type === "RESTOCK") {
        await sendRestockEmail({
          to: email,
          productTitle: product.title,
          productUrl: product.url,
          latestPrice: alert.new_price ?? null,
          currency: safeCurrency, // ✅ always pass safeCurrency
        });
      }

      if (alert.alert_type === "SOLD_OUT") {
        await sendSoldOutEmail({
          to: email,
          productTitle: product.title,
          productUrl: product.url,
        });
      }

      successIds.push(alert.id);
    } catch (err: any) {
      console.error("❌ Failed to send alert email:", alert.id, err);
      errorUpdates.push({ id: alert.id, error: String(err?.message || err) });
    }
  }

  // 5) Mark successful alerts as processed
  if (successIds.length > 0) {
    const { error: updErr } = await supabaseAdmin
      .from("cron_alert_queue")
      .update({
        processed_at: new Date().toISOString(),
        error: null,
      })
      .in("id", successIds);

    if (updErr) {
      console.error("❌ Failed to mark alerts as processed in cron_alert_queue:", updErr);
    }
  }

  // 6) Mark failed alerts with error message
  for (const row of errorUpdates) {
    await supabaseAdmin
      .from("cron_alert_queue")
      .update({
        processed_at: new Date().toISOString(),
        error: row.error,
      })
      .eq("id", row.id);
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    processed: typedAlerts.length,
    sent: successIds.length,
    failed: errorUpdates.length,
  });
}
