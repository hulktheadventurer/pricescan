// =======================================================
// PriceScan - check-prices.cjs (CommonJS worker)
// Works with ES Module adapters
// =======================================================

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// IMPORTANT: ESM adapter -> need `.default`
const { default: EbayAdapter } = require("./lib/adapters/ebay");

// instantiate adapter
const ebay = new EbayAdapter();

// Supabase admin client
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
            to: [product.user_id], // You can adjust — maybe you use user email lookup
            subject: `📉 Price drop: ${product.title}`,
            html: `
                <h2>Good news!</h2>
                <p>${product.title} just had a price drop.</p>
                <p>Old: ${lastPrice} ${currency}<br>New: ${currentPrice} ${currency}</p>
                <a href="${product.url}">View Product</a>
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
