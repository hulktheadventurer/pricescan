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

  const { data: products } = await supabaseAdmin
    .from("tracked_products")
    .select("id, sku, merchant, status, url, title, user_id")
    .eq("merchant", "ebay");

  if (!products?.length)
    return NextResponse.json({ ok: true, scanned: 0 });

  let scanned = 0;

  const previousStatus: Record<string, string> = {};
  products.forEach((p) => (previousStatus[p.id] = p.status));

  const priceInserts: any[] = [];
  const statusUpdates: any[] = [];

  for (const p of products) {
    if (!p.sku) continue;

    const item = await fetchEbayItem(p.sku);
    scanned++;

    if (!item) continue;

    if (item.status !== p.status) {
      statusUpdates.push({ id: p.id, status: item.status });
    }

    if (item.price != null && item.currency) {
      priceInserts.push({
        product_id: p.id,
        price: item.price,
        currency: item.currency,
      });
    }
  }

  // Insert prices
  if (priceInserts.length > 0) {
    await supabaseAdmin.from("price_snapshots").insert(priceInserts);
  }

  // Update statuses in DB
  for (const s of statusUpdates) {
    await supabaseAdmin
      .from("tracked_products")
      .update({ status: s.status })
      .eq("id", s.id);
  }

  // Restock detection
  for (const s of statusUpdates) {
    const oldS = previousStatus[s.id];
    const newS = s.status;

    if (oldS === "SOLD_OUT" && newS === "ACTIVE") {
      await supabaseAdmin.from("cron_alert_queue").insert({
        product_id: s.id,
        type: "RESTOCK",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    startedAt,
    scanned,
    pricesSaved: priceInserts.length,
    statusUpdated: statusUpdates.length,
  });
}
