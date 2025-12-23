import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { getEbayAccessToken } from "@/lib/ebay-auth";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extract eBay legacy item ID from URL or plain ID
function extractId(input: string): string | null {
  if (!input) return null;

  if (/^\d{9,}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const m = url.pathname.match(/(\d{9,})/);
    if (m) return m[1];
  } catch {}

  return null;
}

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json(
    { success: false, error: message, ...(extra ? { extra } : {}) },
    { status }
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
  });

  try {
    return await Promise.race([p, timeoutPromise]);
  } finally {
    if (t) clearTimeout(t);
  }
}

// Turn a Supabase PostgrestBuilder into a real Promise (fixes TS build error)
function exec<T>(builder: any): Promise<T> {
  return builder.then((r: T) => r);
}

// Fetch from eBay with hard timeouts
async function fetchEbayItem(id: string) {
  const token = await withTimeout(getEbayAccessToken(), 12_000, "getEbayAccessToken");

  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${encodeURIComponent(
        id
      )}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }
    );

    const text = await res.text();

    if (!res.ok) {
      console.error("❌ eBay API ERROR:", res.status, text);
      return { ok: false as const, status: res.status, body: text };
    }

    const data = JSON.parse(text);

    const isEnded = !!data.itemEndDate;
    const availability = data.availability?.availabilityStatus;
    const isSoldOut = availability === "OUT_OF_STOCK" || availability === "UNAVAILABLE";

    let statusMessage: string | null = null;
    if (isEnded) statusMessage = "Listing ended";
    else if (isSoldOut) statusMessage = "Out of stock";

    return {
      ok: true as const,
      data: {
        title: data.title ?? "Unknown eBay Item",
        price: Number(data.price?.value ?? 0),
        currency: data.price?.currency ?? "GBP",
        isSoldOut,
        isEnded,
        statusMessage,
        raw: data,
      },
    };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      console.error("❌ eBay fetch timeout/abort");
      return { ok: false as const, status: 504, body: "eBay request timed out" };
    }
    console.error("❌ eBay fetch exception:", e);
    return { ok: false as const, status: 502, body: e?.message || "eBay fetch failed" };
  } finally {
    clearTimeout(kill);
  }
}

// GET for debugging
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const input = url.searchParams.get("id") || url.searchParams.get("url");

  const id = extractId(input || "");
  if (!id) return jsonError("Invalid id/url", 400);

  const result = await fetchEbayItem(id);

  if (!result.ok) {
    return jsonError("Failed to fetch from eBay", result.status || 502, {
      ebay_status: result.status,
      ebay_body: result.body,
    });
  }

  return NextResponse.json({
    success: true,
    id,
    ...result.data,
  });
}

// POST used by /page.tsx
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await withTimeout(req.json(), 5_000, "parse JSON body");
  } catch (e: any) {
    return jsonError(e?.message || "Invalid JSON body", 400);
  }

  const input = body.id || body.url;
  let userId = body.user_id as string | undefined;

  // ✅ If user_id not provided, read Supabase session from cookies (so your HomePage {url} works)
  if (!userId) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id;
  }

  if (!userId) return jsonError("Not signed in", 401);

  const id = extractId(input || "");
  if (!id) return jsonError("Invalid eBay URL or ID", 400);

  // 1) Fetch eBay data (never hangs now)
  const result = await fetchEbayItem(id);
  if (!result.ok) {
    return jsonError("Failed to fetch from eBay", result.status || 502, {
      ebay_status: result.status,
      ebay_body: result.body,
    });
  }

  const item = result.data;
  const urlToSave = input;

  // 2) Check if user already tracks this URL
  const existing = await withTimeout(
    exec(
      supabaseAdmin
        .from("tracked_products")
        .select("id")
        .eq("user_id", userId)
        .eq("url", urlToSave)
        .maybeSingle()
    ),
    8_000,
    "supabase select tracked_products"
  );

  let productId: string;

  if ((existing as any).data) {
    productId = (existing as any).data.id;

    // Update status/title when re-tracking same URL
    await withTimeout(
      exec(
        supabaseAdmin
          .from("tracked_products")
          .update({
            title: item.title,
            is_sold_out: item.isSoldOut,
            is_ended: item.isEnded,
            status_message: item.statusMessage,
            sku: id,
            merchant: "ebay",
            locale: "GB",
          })
          .eq("id", productId)
      ),
      8_000,
      "supabase update tracked_products"
    );
  } else {
    // 3) Insert new product
    const inserted = await withTimeout(
      exec(
        supabaseAdmin
          .from("tracked_products")
          .insert({
            user_id: userId,
            url: urlToSave,
            title: item.title,
            merchant: "ebay",
            locale: "GB",
            sku: id,
            is_sold_out: item.isSoldOut,
            is_ended: item.isEnded,
            status_message: item.statusMessage,
          })
          .select()
          .single()
      ),
      10_000,
      "supabase insert tracked_products"
    );

    const insertError = (inserted as any).error;
    if (insertError || !(inserted as any).data) {
      console.error("❌ Supabase insert error:", insertError);
      return jsonError("Failed to save item", 500, { insertError });
    }

    productId = (inserted as any).data.id;
  }

  // ✅ 4) ALWAYS insert a snapshot so “Updated” refreshes even for sold-out/ended items
  // If sold out / ended, store price as null (assumes price column allows null)
  const snapshotPrice = item.isSoldOut || item.isEnded ? null : item.price;

  const snapRes = await withTimeout(
    exec(
      supabaseAdmin.from("price_snapshots").insert({
        product_id: productId,
        price: snapshotPrice,
        currency: item.currency,
      })
    ),
    10_000,
    "supabase insert price_snapshots"
  );

  const snapError = (snapRes as any).error;
  if (snapError) {
    console.error("❌ Supabase price_snapshots insert error:", snapError);
    // don't fail whole request
  }

  return NextResponse.json({
    success: true,
    product_id: productId,
    is_sold_out: item.isSoldOut,
    is_ended: item.isEnded,
    status_message: item.statusMessage,
  });
}
