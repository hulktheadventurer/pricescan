// app/api/cron-check-prices/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_FROM = process.env.ALERT_FROM;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TrackedProduct = {
  id: string;
  url: string;
  merchant: string | null;
  title: string | null;
  user_id: string;
};

function extractLegacyId(link: string): string | null {
  const cleaned = link.split("?")[0];
  const m = cleaned.match(/\/itm\/(?:[^/]+\/)?(\d{9,12})/);
  return m ? m[1] : null;
}

function toOffer(item: any) {
  const raw = item?.price?.value ?? item?.price;
  return {
    title: item?.title || "Unknown eBay Item",
    price: raw ? Number(raw) : 0,
    currency: item?.price?.currency || "GBP",
  };
}

async function getEbayAccessToken(): Promise<string> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "EBAY_ACCESS_TOKEN")
    .single();

  if (error || !data?.value) {
    throw new Error("No eBay access token found in Supabase");
  }

  return data.value;
}

async function fetchEbayByLegacyId(id: string, token: string) {
  const url =
    "https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=" +
    id;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
    },
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`eBay legacy lookup failed: ${txt}`);
  }

  const json = await res.json();
  return toOffer(json);
}

async function fetchEbayBySearch(q: string, token: string) {
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
    q
  )}&limit=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Search failed: ${txt}`);
  }

  const data = await res.json();
  const item = data?.itemSummaries?.[0];
  if (!item) return null;

  return toOffer({
    title: item.title,
    price: item.price,
  });
}

async function resolveEbay(input: string) {
  const token = await getEbayAccessToken();

  const legacyId = extractLegacyId(input);
  if (legacyId) {
    const found = await fetchEbayByLegacyId(legacyId, token);
    if (found) return found;

    const fallback = await fetchEbayBySearch(legacyId, token);
    if (fallback) return fallback;

    throw new Error(`Legacy ID ${legacyId} not found`);
  }

  const fallback = await fetchEbayBySearch(input, token);
  if (fallback) return fallback;

  throw new Error("Unable to resolve eBay item");
}

async function sendPriceDropEmail(opts: {
  product: TrackedProduct;
  lastPrice: number;
  currentPrice: number;
  currency: string;
}) {
  if (!RESEND_API_KEY || !ALERT_FROM) {
    console.warn("Missing RESEND_API_KEY or ALERT_FROM; skipping email.");
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ALERT_FROM,
      to: [opts.product.user_id], // you might map to a proper email
      subject: `📉 Price drop: ${opts.product.title}`,
      html: `
        <h2>Good news!</h2>
        <p>${opts.product.title} just had a price drop.</p>
        <p>Old: ${opts.lastPrice} ${opts.currency}<br>New: ${opts.currentPrice} ${opts.currency}</p>
        <a href="${opts.product.url}">View Product</a>
      `,
    }),
  });
}

async function checkPricesOnce() {
  const { data: products, error } = await supabase
    .from("tracked_products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Failed to load tracked_products: " + error.message);
  }

  if (!products || products.length === 0) {
    return { scanned: 0, drops: 0, errors: 0 };
  }

  let scanned = 0;
  let drops = 0;
  let errors = 0;

  for (const raw of products as TrackedProduct[]) {
    scanned += 1;
    try {
      let result: { title: string; price: number; currency: string } | null = null;

      if (raw.merchant === "ebay" || !raw.merchant) {
        result = await resolveEbay(raw.url);
      } else {
        console.log(
          `⚠️ Skipping unsupported merchant: ${raw.merchant} for product ${raw.id}`
        );
        continue;
      }

      if (!result) {
        console.log(`• [${raw.id}] No current price found.`);
        continue;
      }

      const currentPrice = result.price;
      const currency = result.currency ?? "GBP";

      // get last snapshot
      const { data: lastSnap } = await supabase
        .from("price_snapshots")
        .select("*")
        .eq("product_id", raw.id)
        .order("seen_at", { ascending: false })
        .limit(1);

      const lastPrice = lastSnap?.[0]?.price ?? null;

      console.log(
        `• [${raw.id}] ${raw.title ?? "Fetching title..."}\n   last: ${
          lastPrice ?? "null"
        } ${currency} | current: ${currentPrice} ${currency}`
      );

      // insert snapshot
      await supabase.from("price_snapshots").insert([
        {
          product_id: raw.id,
          price: currentPrice,
          currency,
        },
      ]);

      // optional: update title if missing
      if (!raw.title && result.title) {
        await supabase
          .from("tracked_products")
          .update({ title: result.title })
          .eq("id", raw.id);
      }

      // price drop detection
      if (lastPrice !== null && currentPrice < lastPrice) {
        drops += 1;
        console.log(`📉 Price dropped for "${raw.title ?? result.title}"`);
        await sendPriceDropEmail({
          product: raw,
          lastPrice,
          currentPrice,
          currency,
        });
      }
    } catch (err: any) {
      errors += 1;
      console.error(
        `❌ Error processing [${raw.id}]:`,
        err?.message ?? String(err)
      );
    }
  }

  return { scanned, drops, errors };
}

export async function GET() {
  try {
    console.log(
      "🔎 [cron-check-prices] Running at",
      new Date().toISOString()
    );
    const result = await checkPricesOnce();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error("cron-check-prices error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
