// ================================================
// PriceScan – Fetcher Job (Ebay Only)
// ================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { EbayAdapter } from "../lib/adapters/ebay/resolve.js";

// 🧩 Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ebay = new EbayAdapter();

async function main() {
  console.log("🚀 Starting fetcher job... (eBay only)");

  const { data: products, error } = await supabase
    .from("tracked_products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!products || products.length === 0) {
    console.log("📭 No products to fetch.");
    return;
  }

  console.log(`📦 Found ${products.length} tracked product(s).`);

  for (const product of products) {
    try {
      console.log(`🔍 Fetching for: ${product.title || product.url}`);

      const offer = await ebay.resolve(product.url);

      if (!offer) {
        console.warn(`⚠️ No offer found for ${product.url}`);
        continue;
      }

      await supabase.from("price_snapshots").insert({
        product_id: product.id,
        price: offer.price,
        currency: offer.currency || "GBP",
        seen_at: new Date().toISOString(),
      });

      console.log(`💾 Price updated: ${offer.currency} ${offer.price}`);

      const updates = {};
      if (!product.title || product.title.startsWith("Pending")) {
        updates.title = offer.title;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("tracked_products")
          .update(updates)
          .eq("id", product.id);

        console.log(`🧱 Updated title → ${offer.title}`);
      }
    } catch (err) {
      console.error(`❌ Fetch failed: ${err.message}`);
    }
  }

  console.log("🏁 Fetcher job complete.");
}

main().catch((err) => console.error("Fatal error:", err));
