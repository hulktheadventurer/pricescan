import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAccessToken } from "@/lib/ebay-auth";

// Extract eBay legacy item ID from URL or plain ID
function extractId(input: string): string | null {
  if (!input) return null;

  // If user just types the ID (9+ digits)
  if (/^\d{9,}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const m = url.pathname.match(/(\d{9,})/);
    if (m) return m[1];
  } catch {}

  return null;
}

// Fetch from eBay
async function fetchEbayItem(id: string) {
  const token = await getEbayAccessToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const text = await res.text();
  if (!res.ok) {
    console.error("❌ eBay API ERROR:", text);
    return null;
  }

  const data = JSON.parse(text);

  // Detect sold out / ended
  const isEnded = !!data.itemEndDate;
  const isSoldOut =
    data.availability?.availabilityStatus === "OUT_OF_STOCK" ||
    data.availability?.availabilityStatus === "UNAVAILABLE";

  let statusMessage = null;
  if (isEnded) statusMessage = "Listing ended";
  else if (isSoldOut) statusMessage = "Out of stock";

  return {
    title: data.title ?? "Unknown eBay Item",
    price: Number(data.price?.value ?? 0),
    currency: data.price?.currency ?? "GBP",
    isSoldOut,
    isEnded,
    statusMessage,
    raw: data,
  };
}

// GET for debugging
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const input = url.searchParams.get("id") || url.searchParams.get("url");

  const id = extractId(input || "");
  if (!id) {
    return NextResponse.json({ error: "Invalid id/url" }, { status: 400 });
  }

  const item = await fetchEbayItem(id);
  if (!item) {
    return NextResponse.json({ error: "Failed to fetch from eBay" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id,
    ...item,
  });
}

// POST used by /page.tsx
export async function POST(req: NextRequest) {
  const body = await req.json();
  const input = body.id || body.url;
  const userId = body.user_id;

  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const id = extractId(input || "");
  if (!id) {
    return NextResponse.json(
      { error: "Invalid eBay URL or ID" },
      { status: 400 }
    );
  }

  // 1) Fetch eBay data
  const item = await fetchEbayItem(id);
  if (!item) {
    return NextResponse.json(
      { error: "Failed to fetch from eBay" },
      { status: 502 }
    );
  }

  const urlToSave = input;

  // 2) Check if user already tracks this URL
  const existing = await supabaseAdmin
    .from("tracked_products")
    .select("id")
    .eq("user_id", userId)
    .eq("url", urlToSave)
    .maybeSingle();

  let productId: string;

  if (existing.data) {
    // Already exists
    productId = existing.data.id;
  } else {
    // 3) Insert new product
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("tracked_products")
      .insert({
        user_id: userId,
        url: urlToSave,
        title: item.title,
        merchant: "ebay",
        locale: "GB",
        sku: id,
        is_sold_out: item.isSoldOut,
        is_ended: item.isEnded,
        status_message: item.statusMessage,
      })
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("❌ Supabase insert error:", insertError);
      return NextResponse.json({ error: "Failed to save item" }, { status: 500 });
    }

    productId = inserted.id;
  }

  // 4) Insert price snapshot only if item is NOT sold-out/ended
  if (!item.isSoldOut && !item.isEnded) {
    const { error: snapError } = await supabaseAdmin
      .from("price_snapshots")
      .insert({
        product_id: productId,
        price: item.price,
        currency: item.currency,
      });

    if (snapError) {
      console.error("❌ Supabase price_snapshots insert error:", snapError);
    }
  }

  return NextResponse.json({
    success: true,
    product_id: productId,
  });
}
