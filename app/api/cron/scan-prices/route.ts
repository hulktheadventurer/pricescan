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
    .select("id, sku, merchant, status, url, title, user_id")
    .eq("merchant", "ebay");

  if (prodErr) {
    console.error("❌ Failed to load tracked_products:", prodErr);
    return NextResponse.json({ ok: false, startedAt, error: prodErr.message }, { status: 500 });
  }

  if (!products?.length) return NextResponse.json({ ok: true, startedAt, scanned: 0 });

  let scanned = 0;

  // Remember previous status to detect RESTOCK
  const previousStatus: Record<string, string> = {};
  products.forEach((p) => (previousStatus[p.id] = p.status));

  const statusUpdates: { id: string; status: EbayStatus }[] = [];
  const priceInserts: { product_id: string; price: number; currency: string }[] = [];

  // For PRICE_DROP detection we need current snapshot vs previous low
  const priceDropAlerts: { product_id: string; type: string; old_price: number; new_price: number }[] =
    [];

  for (const p of products) {
    if (!p.sku) continue;

    const item = await fetchEbayItem(p.sku);
    scanned++;

    if (!item) continue;

    // status change tracking
    if (item.status !== p.status) {
      statusUpdates.push({ id: p.id, status: item.status });
    }

    // price snapshot + price drop detection
    if (item.price != null && item.currency) {
      // Find previous lowest price (excluding this new one)
      const { data: prevSnaps, error: snapErr } = await supabaseAdmin
        .from("price_snapshots")
        .select("price")
        .eq("product_id", p.id)
        .order("seen_at", { ascending: false })
        .limit(200);

      if (snapErr) {
        console.error("❌ Failed to load snapshots for", p.id, snapErr);
      } else if (prevSnaps && prevSnaps.length > 0) {
        const prevLow = Math.min(...prevSnaps.map((s: any) => Number(s.price)).filter((n) => isFinite(n)));

        // Only alert if this is a NEW LOW (strictly lower)
        if (isFinite(prevLow) && item.price < prevLow) {
          priceDropAlerts.push({
            product_id: p.id,
            type: "PRICE_DROP",
            old_price: prevLow,
            new_price: item.price,
          });
        }
      }

      priceInserts.push({
        product_id: p.id,
        price: item.price,
        currency: item.currency,
      });
    }
  }

  // Insert prices
  if (priceInserts.length > 0) {
    const { error } = await supabaseAdmin.from("price_snapshots").insert(priceInserts);
    if (error) console.error("❌ Insert price_snapshots failed:", error);
  }

  // Update statuses in DB
  for (const s of statusUpdates) {
    const { error } = await supabaseAdmin
      .from("tracked_products")
      .update({ status: s.status })
      .eq("id", s.id);

    if (error) console.error("❌ Update tracked_products status failed:", error);
  }

  // Restock detection -> queue RESTOCK email
  for (const s of statusUpdates) {
    const oldS = previousStatus[s.id];
    const newS = s.status;

    if (oldS === "SOLD_OUT" && newS === "ACTIVE") {
      const { error } = await supabaseAdmin.from("cron_alert_queue").insert({
        product_id: s.id,
        type: "RESTOCK",
      });
      if (error) console.error("❌ Insert RESTOCK alert failed:", error);
    }
  }

  // Price drop detection -> queue PRICE_DROP email
  if (priceDropAlerts.length > 0) {
    const { error } = await supabaseAdmin.from("cron_alert_queue").insert(priceDropAlerts);
    if (error) console.error("❌ Insert PRICE_DROP alerts failed:", error);
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    scanned,
    pricesSaved: priceInserts.length,
    statusUpdated: statusUpdates.length,
    priceDropQueued: priceDropAlerts.length,
  });
}
