import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import EbayAdapter from "@/lib/adapters/ebay";
import { sendPriceDropEmail } from "@/lib/emails/priceDropEmail";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const ebay = new EbayAdapter();

export async function GET(_req: NextRequest) {
  try {
    console.log("🔁 Running price scan…");

    // 1) Load all tracked products with their snapshots
    const { data: products, error } = await supabase
      .from("tracked_products")
      .select(
        `
        id,
        user_id,
        title,
        url,
        merchant,
        price_snapshots (
          price,
          currency,
          seen_at
        )
      `
      );

    if (error) {
      console.error("❌ Failed to load tracked_products:", error);
      return NextResponse.json(
        { error: "DB error loading tracked_products" },
        { status: 500 }
      );
    }

    if (!products || products.length === 0) {
      console.log("ℹ️ No tracked products found.");
      return NextResponse.json({ ok: true, scanned: 0, alerts: 0 });
    }

    let scanned = 0;
    let alerts = 0;

    for (const product of products) {
      const { id: productId, user_id, title, url, merchant, price_snapshots } =
        product;

      // Only support eBay for now
      if (!url || merchant !== "ebay") continue;

      // Get historical prices
      const snaps = price_snapshots || [];
      let allTimeLow: number | null = null;
      let lastCurrency = "GBP";

      if (snaps.length > 0) {
        snaps.forEach((s: any) => {
          const p = Number(s.price);
          if (!isNaN(p)) {
            if (allTimeLow === null || p < allTimeLow) allTimeLow = p;
          }
          if (s.currency) lastCurrency = s.currency;
        });
      }

      // 2) Fetch current price from eBay
      let resolved: any;
      try {
        resolved = await ebay.resolve(url);
      } catch (err: any) {
        console.error("❌ eBay resolve failed for", url, err?.message || err);
        continue;
      }

      const newPrice =
        typeof resolved.price === "number" && resolved.price > 0
          ? resolved.price
          : null;
      const currency = resolved.currency || lastCurrency || "GBP";

      if (!newPrice) {
        console.warn("⚠️ No valid price for", url);
        continue;
      }

      scanned++;

      // 3) Insert new snapshot
      await supabase.from("price_snapshots").insert([
        {
          product_id: productId,
          price: newPrice,
          currency,
        },
      ]);

      console.log(
        `💾 Snapshot saved for product ${productId}: ${currency} ${newPrice}`
      );

      // 4) Determine if this is a *new all-time low*
      const hadHistory = allTimeLow !== null;

if (allTimeLow !== null && typeof newPrice === "number" && newPrice < allTimeLow) {
        alerts++;

        // Log in price_alerts
        await supabase.from("price_alerts").insert([
          {
            user_id,
            product_id: productId,
            old_price: allTimeLow,
            new_price: newPrice,
            currency,
          },
        ]);

        console.log(
          `📉 New all-time low for product ${productId}: ${allTimeLow} → ${newPrice}`
        );

        // 5) Fetch user email via admin API
        try {
          const { data: userData, error: userErr } =
            await supabase.auth.admin.getUserById(user_id);

          if (userErr || !userData?.user?.email) {
            console.warn(
              "⚠️ Could not load user email for price alert:",
              userErr
            );
          } else {
            const email = userData.user.email;

            await sendPriceDropEmail({
              to: email,
              productTitle: title || "Tracked item",
              productUrl: url,
              oldPrice: allTimeLow as number,
              newPrice,
              currency,
            });
          }
        } catch (err) {
          console.error("❌ Failed to send price drop email:", err);
        }
      }
    }

    return NextResponse.json({ ok: true, scanned, alerts });
  } catch (err: any) {
    console.error("❌ scan-prices failed:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
