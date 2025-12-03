import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAccessToken } from "@/lib/ebay-auth";

function extractId(input: string): string | null {
  if (!input) return null;

  // If user enters just the legacy ID
  if (/^\d{9,}$/.test(input)) return input;

  // Try URL extraction
  try {
    const url = new URL(input);
    const match = url.pathname.match(/(\d{9,})/);
    if (match) return match[1];
  } catch {}

  return null;
}

async function fetchEbayItem(id: string) {
  const token = await getEbayAccessToken();

  const res = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${id}`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    console.error("❌ eBay API error", await res.text());
    return null;
  }

  const data = await res.json();

  return {
    title: data.title ?? "Unknown title",
    currency: data.price?.currency ?? "GBP",
    price: Number(data.price?.value ?? 0),
    raw: data,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const input = body.id || body.url;
  const userId = body.user_id; // must be passed from client

  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  const id = extractId(input || "");
  if (!id) {
    return NextResponse.json({ error: "Invalid eBay URL or ID" }, { status: 400 });
  }

  // Fetch live data
  const item = await fetchEbayItem(id);
  if (!item) {
    return NextResponse.json({ error: "Failed to fetch from eBay" }, { status: 500 });
  }

  // Check if product already tracked by this user
  const existing = await supabaseAdmin
    .from("tracked_products")
    .select("*")
    .eq("user_id", userId)
    .eq("item_id", id)
    .maybeSingle();

  if (existing.data) {
    return NextResponse.json({
      success: true,
      message: "Already tracked",
      product: existing.data,
    });
  }

  // Insert new tracked item
  const { data, error } = await supabaseAdmin
    .from("tracked_products")
    .insert({
      user_id: userId,
      item_id: id,
      title: item.title,
      current_price: item.price,
      currency: item.currency,
      source: "ebay",
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save item" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    product: data,
  });
}
