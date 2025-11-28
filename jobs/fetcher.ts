// ================================================
// PriceScan Stage 13 – Full Fetcher Job (Ebay-Only Fixed)
// ================================================

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { EbayAdapter } from "../lib/adapters/ebay/resolve.js";
import fs from "fs";

// 🧩 Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 🧩 Load Ebay adapter
const ebay = new EbayAdapter();

async function main() {
  console.log("🚀 Starting fetcher job...");

  // Load tracked products
  const { data: products, error } = await supabase
    .from("tracked_products")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  if (!products || products.length === 0) {
    console.log("📭 No products to fetch.");
    return;
  }

  console.log(`📦 Found ${products.length} tracked product(s) to fetch.`);

  for (const product of products) {
    try {
      console.log(`🔍 Fetching for: ${product.title || product.url}`);

      // 🧠 Only eBay is supported for now
      const isEbay = product.merchant?.toLowerCase() === "ebay";
      if (!isEbay) {
        console.log(`⏭ Skipping non-eBay merchant: ${product.merchant}`);
        continue;
      }

      // 🧠 Attempt resolve (URL ONLY)
      const result = await ebay.resolve(product.url);

      if (!result || !result.price) {
        console.warn(`⚠️ No price returned for ${product.title || product.url}`);
        continue;
      }

      const newPrice = result.price;
      const currency = result.currency ?? "GBP";

      // 💾 Save price snapshot
      await supabase.from("price_snapshots").insert({
        product_id: product.id,
        price: newPrice,
        currency,
        seen_at: new Date().toISOString(),
      });

      console.log(
        `💾 Price updated → ${currency} ${newPrice} (${product.title || product.url})`
      );

      // 🎯 Update title if missing
      const updates: any = {};

      if (!product.title || product.title === "Fetching title...") {
        updates.title = result.title;
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("tracked_products")
          .update(updates)
          .eq("id", product.id);
        console.log(`🧱 Updated metadata for: ${updates.title}`);
      }

    } catch (err: any) {
      console.error(
        `❌ Fetch failed for ${product.title || product.url}: ${err.message}`
      );
    }
  }

  console.log("🏁 Fetcher job complete.");
}

main().catch((e) => console.error("Fatal error:", e));
