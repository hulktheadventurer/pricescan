// app/api/cron/scan-prices/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAccessToken } from "@/lib/ebay-auth";

type EbayStatus = "ACTIVE" | "SOLD_OUT" | "ENDED" | "UNKNOWN";

async function fetchEbayItem(sku: string) {
  const token = await getEbayAccessToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${sku}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  // Listing removed → treat as ended
  if (res.status === 404) {
    return { status: "ENDED" as EbayStatus };
  }

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ eBay cron error", res.status, text);
    return { status: "UNKNOWN" as EbayStatus };
  }

  const data = await res.json();

  const rawPrice = Number(data.price?.value ?? NaN);
  const currency = data.price?.currency ?? null;

  // Detect stock quantity
  const quantity =
    data.availability?.shipToLocationAvailability?.quantity ??
    data.estimatedAvailabilities?.[0]?.shipToLocationAvailability?.quantity ??
    null;

  const itemEndDate = data.itemEndDate ? new Date(data.itemEndDate) : null;
  const now = new Date();

  let status: EbayStatus = "ACTIVE";

  // Listing ended
  if (itemEndDate && itemEndDate < now) {
    status = "ENDED";
  }
  // Sold out
  else if (quantity === 0) {
    status = "SOLD_OUT";
  }

  // If price is missing, treat as unavailable
  if (!isFinite(rawPrice) || !currency) {
    return {
      status,
      price: null,
      currency: null,
    };
  }

  return {
    status,
    price: rawPrice,
    currency,
  };
}

// MAIN CRON ENTRYPOINT
export async function GET() {
  const startedAt = new Date().toISOString();

  // Pull all eBay-tracked rows
  const { data: products, error } = await supabaseAdmin
    .from("tracked_products")
    .select("id, sku, merchant, is_sold_out, is_ended")
    .eq("merchant", "ebay");

  if (error) {
    console.error("❌ Supabase fetch error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, startedAt });
  }

  let scanned = 0;

  const priceSnapshots: { product_id: string; price: number; currency: string }[] = [];
  const updates: {
    id: string;
    is_sold_out?: boolean;
    is_ended?: boolean;
    status_message?: string | null;
  }[] = [];

  const alerts: {
    product_id: string;
    type: "PRICE_DROP" | "RESTOCK";
    oldPrice?: number;
    newPrice?: number;
  }[] = [];

  for (const p of products) {
    if (!p.sku) continue;

    scanned++;

    let item;
    try {
      item = await fetchEbayItem(p.sku);
    } catch (err) {
      console.error("❌ Fetch error for SKU", p.sku, err);
      continue;
    }

    if (!item) continue;

    // Load last snapshot (to detect price drop)
    const { data: lastSnap } = await supabaseAdmin
      .from("price_snapshots")
      .select("price, currency")
      .eq("product_id", p.id)
      .order("seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Prepare updates
    const rowUpdate: any = { id: p.id, status_message: null };

    // Handle ENDED listing
    if (item.status === "ENDED" && !p.is_ended) {
      rowUpdate.is_ended = true;
      rowUpdate.status_message = "Listing has ended";
    }

    // Handle SOLD OUT
    if (item.status === "SOLD_OUT" && !p.is_sold_out) {
      rowUpdate.is_sold_out = true;
      rowUpdate.status_message = "Item is sold out";
    }

    // Handle RESTOCK
    if (item.status === "ACTIVE" && p.is_sold_out) {
      // previously sold out, now back
      rowUpdate.is_sold_out = false;
      rowUpdate.status_message = "Item is back in stock";

      alerts.push({
        product_id: p.id,
        type: "RESTOCK",
      });
    }

    // Insert price snapshot if available
    if (item.price != null && item.currency) {
      priceSnapshots.push({
        product_id: p.id,
        price: item.price,
        currency: item.currency,
      });

      // Detect price drop
      if (lastSnap && item.price < lastSnap.price) {
        alerts.push({
          product_id: p.id,
          type: "PRICE_DROP",
          oldPrice: lastSnap.price,
          newPrice: item.price,
        });
      }
    }

    updates.push(rowUpdate);
  }

  // Bulk insert price snapshots
  if (priceSnapshots.length > 0) {
    const { error: snapErr } = await supabaseAdmin
      .from("price_snapshots")
      .insert(priceSnapshots);

    if (snapErr) console.error("❌ Snapshot insert error", snapErr);
  }

  // Apply row updates
  for (const u of updates) {
    const { id, ...fields } = u;
    await supabaseAdmin.from("tracked_products").update(fields).eq("id", id);
  }

  // Store alerts for next cron (send-alerts)
  if (alerts.length > 0) {
    await supabaseAdmin.from("cron_alert_queue").insert(alerts);
  }

  return NextResponse.json({
    ok: true,
    scanned,
    pricesSaved: priceSnapshots.length,
    recordsUpdated: updates.length,
    alertsQueued: alerts.length,
    startedAt,
  });
}
