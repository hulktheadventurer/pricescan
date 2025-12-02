// =======================================================
// PriceScan - check-prices.cjs (CommonJS worker)
// Loads environment from .env.local (shared with Next.js)
// =======================================================

// Force dotenv to load .env.local instead of .env
require("dotenv").config({ path: ".env.local" });

// Node 18+ has fetch globally. If older Node needed this instead:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const { createClient } = require("@supabase/supabase-js");

// IMPORTANT: ESM adapter -> need `.default`
const EbayAdapter = require("./lib/adapters/ebay/index.cjs");

// Instantiate adapter
const ebay = new EbayAdapter();

// =======================================================
// SUPABASE CLIENT (Admin)
// =======================================================
//
// NEXT_PUBLIC_SUPABASE_URL works both in Next.js & Node.
// But the service role key is NEVER public — so we read:
//   SUPABASE_SERVICE_ROLE_KEY
//
// This is the correct pairing.
//

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

console.log("🔎 Fetching tracked products from Supabase at", new Date().toISOString());

async function checkPrices() {
  const { data: products, error } = await supabase
    .from("tracked_products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Failed to load tracked_products:", error);
    return;
  }

  if (!products || products.length === 0) {
    console.log("ℹ️ No products to check.");
    return;
  }

  console.log(`🔎 Checking ${products.length} tracked product(s)...`);

  for (const product of products) {
    try {
      let result;

      // Only eBay for now
      if (product.merchant === "ebay") {
        result = await ebay.resolve(product.url);
      } else {
        console.log(`⚠️ Skipping unsupported merchant: ${product.merchant}`);
        continue;
      }

      if (!result) {
        console.log(`• [${product.id}] No current price found.`);
        continue;
      }

      const currentPrice = result.price;
      const currency = result.currency ?? "GBP";

      // Fetch last snapshot
      const { data: lastSnap } = await supabase
        .from("price_snapshots")
        .select("*")
        .eq("product_id", product.id)
        .order("seen_at", { ascending: false })
        .limit(1);

      const lastPrice = lastSnap?.[0]?.price ?? null;

      console.log(
        `• [${product.id}] ${product.title}\n   last: ${lastPrice} ${currency} | current: ${currentPrice} ${currency}`
      );

      // Insert new snapshot
      await supabase.from("price_snapshots").insert([
        {
          product_id: product.id,
          price: currentPrice,
          currency,
        },
      ]);

      // Price drop detection
      if (lastPrice !== null && currentPrice < lastPrice) {
        console.log(`📉 Price dropped for "${product.title}"`);

        // SEND EMAIL
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.ALERT_FROM,
            to: [product.user_id], // You can adjust — maybe look up the email
            subject: `📉 Price drop: ${product.title}`,
            html: `
              <h2>Good news!</h2>
              <p><strong>${product.title}</strong> just had a price drop.</p>
              <p>Old: ${lastPrice} ${currency}<br>New: ${currentPrice} ${currency}</p>
              <a href="${product.url}" style="color:#4F46E5;font-weight:bold;">View Product</a>
            `,
          }),
        });

        console.log(`   📧 Alert sent to ${product.user_id}`);
      }

    } catch (err) {
      console.error(`❌ Error processing [${product.id}]:`, err.message || err);
    }
  }

  console.log("✅ Done.");
}

checkPrices();
