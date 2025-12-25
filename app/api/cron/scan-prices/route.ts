// app/api/cron/scan-prices/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAccessToken } from "@/lib/ebay-auth";

type EbayStatus = "ACTIVE" | "SOLD_OUT" | "ENDED" | "UNKNOWN";

async function fetchEbayItem(sku: string) {
  const token = await getEbayAccessToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${sku}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 404) return { status: "ENDED" as EbayStatus };

  if (!res.ok) {
    console.error("eBay error:", await res.text());
    return { status: "UNKNOWN" as EbayStatus };
  }

  const data = await res.json();

  const price = Number(data.price?.value ?? NaN);
  const currency = data.price?.currency ?? null;

  const qty =
    data.availability?.shipToLocationAvailability?.quantity ??
    data.estimatedAvailabilities?.[0]?.shipToLocationAvailability?.quantity ??
    null;

  const endDate = data.itemEndDate ? new Date(data.itemEndDate) : null;
  const now = new Date();

  let status: EbayStatus = "ACTIVE";
  if (endDate && endDate < now) status = "ENDED";
  else if (qty === 0) status = "SOLD_OUT";

  return {
    status,
    price: isFinite(price) ? price : null,
    currency,
  };
}

// CRON ENTRY
export async function GET() {
  const startedAt = new Date().toISOString();

  const { data: products, error: prodErr } = await supabaseAdmin
    .from("tracked_products")
    .select("id, sku, merchant, status")
    .eq("merchant", "ebay");

  if (prodErr) {
    console.error("❌ Failed to fetch tracked_products:", prodErr);
    return NextResponse.json({ ok: false, startedAt, error: prodErr.message }, { status: 500 });
  }

  if (!products?.length) return NextResponse.json({ ok: true, startedAt, scanned: 0 });

  let scanned = 0;

  // store old statuses to detect restock
  const previousStatus: Record<string, string> = {};
  products.forEach((p) => (previousStatus[p.id] = p.status));

  const statusUpdates: Array<{ id: string; status: EbayStatus }> = [];
  const priceInserts: Array<{ product_id: string; price: number; currency: string }> = [];

  // We'll queue alerts in bulk too
  const alertInserts: Array<{
    product_id: string;
    type: "PRICE_DROP" | "RESTOCK";
    old_price?: number | null;
    new_price?: number | null;
  }> = [];

  for (const p of products) {
    if (!p.sku) continue;

    // get previous/latest snapshot BEFORE inserting new one
    const { data: prevSnap } = await supabaseAdmin
      .from("price_snapshots")
      .select("price, currency, seen_at")
      .eq("product_id", p.id)
      .order("seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevPrice = prevSnap?.price ?? null;

    const item = await fetchEbayItem(p.sku);
    scanned++;

    if (!item) continue;

    // status change?
    if (item.status !== p.status) {
      statusUpdates.push({ id: p.id, status: item.status });
    }

    // save snapshot
    if (item.price != null && item.currency) {
      priceInserts.push({
        product_id: p.id,
        price: item.price,
        currency: item.currency,
      });

      // PRICE DROP detection: compare to previous latest snapshot
      if (prevPrice != null && item.price < prevPrice) {
        alertInserts.push({
          product_id: p.id,
          type: "PRICE_DROP",
          old_price: prevPrice,
          new_price: item.price,
        });
      }
    }
  }

  // Insert snapshots
  if (priceInserts.length > 0) {
    const { error: insErr } = await supabaseAdmin.from("price_snapshots").insert(priceInserts);
    if (insErr) console.error("❌ price_snapshots insert error:", insErr);
  }

  // Update statuses
  for (const s of statusUpdates) {
    const { error: upErr } = await supabaseAdmin
      .from("tracked_products")
      .update({ status: s.status })
      .eq("id", s.id);

    if (upErr) console.error("❌ tracked_products status update error:", upErr);
  }

  // RESTOCK detection (SOLD_OUT -> ACTIVE)
  for (const s of statusUpdates) {
    const oldS = previousStatus[s.id];
    const newS = s.status;

    if (oldS === "SOLD_OUT" && newS === "ACTIVE") {
      alertInserts.push({
        product_id: s.id,
        type: "RESTOCK",
      });
    }
  }

  // Insert alerts (this is what powers email sending)
  if (alertInserts.length > 0) {
    const { error: alertErr } = await supabaseAdmin.from("cron_alert_queue").insert(alertInserts);
    if (alertErr) console.error("❌ cron_alert_queue insert error:", alertErr);
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    scanned,
    pricesSaved: priceInserts.length,
    statusUpdated: statusUpdates.length,
    alertsQueued: alertInserts.length,
  });
}
