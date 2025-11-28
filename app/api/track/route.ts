import { NextResponse } from "next/server"; 
import { createClient } from "@supabase/supabase-js";

// IMPORTANT: force the TypeScript EbayAdapter (new version)
import EbayAdapter from "@/lib/adapters/ebay/index";

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

const ebay = new EbayAdapter();

export async function POST(req: Request) {
  try {
    const { url, user_id } = await req.json();

    console.log("📥 /api/track received:", { url, user_id });

    if (!url || !user_id) {
      return NextResponse.json(
        { error: "Missing url or user_id" },
        { status: 400 }
      );
    }

    // ============================
    // 🔍 Detect merchant
    // ============================
    let merchant = "unknown";
    if (url.includes("ebay.")) merchant = "ebay";

    if (merchant === "unknown") {
      return NextResponse.json(
        { error: "Unsupported merchant (only eBay for now)" },
        { status: 400 }
      );
    }

    // ============================
    // 📝 Insert placeholder product
    // ============================
    const { data: product, error: insertErr } = await supabase
      .from("tracked_products")
      .insert([
        {
          user_id,
          url,
          merchant,
          locale: "uk",
          title: "Fetching title...",
          sku: null,
        },
      ])
      .select()
      .single();

    if (insertErr) throw insertErr;

    console.log("🆕 Product inserted:", product.id);

    // ============================
    // 🔍 Resolve price & title
    // ============================
    let result;

    try {
      result = await ebay.resolve(url);
    } catch (err: any) {
      console.error("❌ eBay resolve() failed:", err);

      // Detect eBay item-group error
      if (
        err?.response?.errors?.[0]?.errorId === 11006 ||
        err?.message?.includes("item_group_id")
      ) {
        console.warn("⚠️ Item group detected. Deleting placeholder.");

        await supabase.from("tracked_products").delete().eq("id", product.id);

        return NextResponse.json(
          {
            error: "GROUP_LISTING",
            message:
              "This eBay listing has multiple variations. Please select a specific option (colour/model/storage) before tracking.",
          },
          { status: 400 }
        );
      }

      throw err;
    }

    console.log("📦 eBay resolve() result:", result);

    // ============================
    // 📦 Always use first result (array support)
    // ============================
    const offer = Array.isArray(result) ? result[0] : result;

    const resolvedTitle =
      typeof offer.title === "string" && offer.title.trim() !== ""
        ? offer.title.trim()
        : "Unknown eBay Item";

    const resolvedPrice =
      typeof offer.price === "number" && offer.price > 0
        ? offer.price
        : null;

    const resolvedCurrency = offer.currency ?? "GBP";

    // ============================
    // 💾 Insert price snapshot
    // ============================
    const { error: snapErr } = await supabase.from("price_snapshots").insert([
      {
        product_id: product.id,
        price: resolvedPrice,
        currency: resolvedCurrency,
        seen_at: new Date().toISOString(),
      },
    ]);

    if (snapErr) {
      console.error("❌ Failed to insert snapshot:", snapErr);
      throw snapErr;
    }

    // ============================
    // 📝 Update product title
    // ============================
    await supabase
      .from("tracked_products")
      .update({ title: resolvedTitle })
      .eq("id", product.id);

    return NextResponse.json({
      success: true,
      product_id: product.id,
      title: resolvedTitle,
      first_price: resolvedPrice,
      currency: resolvedCurrency,
    });
  } catch (err: any) {
    console.error("❌ /api/track failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
