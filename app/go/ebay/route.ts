// app/go/ebay/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* -------------------- UTM HELPER -------------------- */
function withUtm(
  url: string,
  {
    source,
    campaign,
  }: { source: string; campaign: string }
) {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "pricescan");
    u.searchParams.set("utm_medium", source);     // email | homepage | alert
    u.searchParams.set("utm_campaign", campaign); // price_drop | restock
    return u.toString();
  } catch {
    // If eBay gives something weird, fail safe
    return url;
  }
}

/* -------------------- MAIN REDIRECT -------------------- */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const productId = searchParams.get("product");
  const campaign = searchParams.get("campaign") || "unknown";
  const source = searchParams.get("source") || "unknown";

  if (!productId) {
    return NextResponse.json(
      { error: "Missing product parameter" },
      { status: 400 }
    );
  }

  /* 1️⃣ Fetch product */
  const { data: product, error: prodErr } = await supabaseAdmin
    .from("tracked_products")
    .select("id, url, user_id")
    .eq("id", productId)
    .maybeSingle();

  if (prodErr || !product) {
    return NextResponse.json(
      { error: "Product not found" },
      { status: 404 }
    );
  }

  /* 2️⃣ Log outbound click */
  await supabaseAdmin.from("outbound_clicks").insert({
    product_id: product.id,
    user_id: product.user_id,
    merchant: "ebay",
    source,
    campaign,
  });

  /* 3️⃣ Build final affiliate URL + UTMs */
  const rawAffiliateUrl = getEbayAffiliateLink(product.url);
  const finalUrl = withUtm(rawAffiliateUrl, { source, campaign });

  /* 4️⃣ Redirect */
  return NextResponse.redirect(finalUrl, { status: 302 });
}
