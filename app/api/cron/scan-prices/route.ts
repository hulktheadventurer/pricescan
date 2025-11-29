import { NextResponse } from "next/server";
import EbayAdapter from "@/lib/adapters/ebay";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log("🔍 Cron: Scanning all prices...");

  const { data: products } = await supabase
    .from("tracked_products")
    .select("*");

  const ebay = new EbayAdapter();

  for (const p of products || []) {
    try {
      const offer = await ebay.resolve(p.url);

      await supabase.from("price_snapshots").insert([
        {
          product_id: p.id,
          price: offer.price,
          currency: offer.currency,
          seen_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("❌ Error scanning", p.url, err);
    }
  }

  return NextResponse.json({ success: true, count: products?.length });
}
