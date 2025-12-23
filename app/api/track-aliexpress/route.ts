import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function exec<T>(builder: any): Promise<T> {
  return builder.then((r: T) => r);
}

function normalizeAliUrl(input: string) {
  const u = new URL(input);
  // Strip tracking noise (safe for “same URL” matching)
  u.searchParams.delete("spm");
  u.searchParams.delete("dp");
  u.searchParams.delete("gatewayAdapt");
  return u.toString();
}

function extractAliItemId(url: string): string | null {
  // Common format: /item/1005001234567890.html
  const m = url.match(/\/item\/(\d+)\.html/i);
  if (m?.[1]) return m[1];

  // Some share links use item/<id>.html in different domains, above still catches.
  return null;
}

function parseFromRunParams(html: string) {
  // AliExpress pages often include a JSON blob like: window.runParams = {...}
  // We’ll try to extract it safely.
  const idx = html.indexOf("window.runParams");
  if (idx === -1) return null;

  // Try a loose extraction of the first {...}; after window.runParams =
  const slice = html.slice(idx, idx + 200000); // cap
  const eq = slice.indexOf("=");
  if (eq === -1) return null;

  const afterEq = slice.slice(eq + 1);

  // Find the first '{' and then best-effort match until '};'
  const start = afterEq.indexOf("{");
  const end = afterEq.indexOf("};");
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = afterEq.slice(start, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function parseMeta(html: string, property: string): string | null {
  // <meta property="product:price:amount" content="12.34">
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ?? null;
}

function parseTitle(html: string): string | null {
  // Try og:title
  const og = parseMeta(html, "og:title");
  if (og) return og;

  // Fall back to <title>
  const m = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function parsePrice(html: string): { price: number | null; currency: string | null } {
  // First try meta product price
  const amount = parseMeta(html, "product:price:amount");
  const curr = parseMeta(html, "product:price:currency");

  if (amount && !Number.isNaN(Number(amount))) {
    return { price: Number(amount), currency: (curr || "USD").toUpperCase() };
  }

  // Try runParams if present
  const run = parseFromRunParams(html);
  if (run) {
    // Very defensive: different shapes exist across locales
    const tryPaths: any[] = [
      run?.data?.priceComponent?.discountPrice,
      run?.data?.priceComponent?.origPrice,
      run?.data?.priceComponent?.multiCurrencyPrice,
      run?.data?.priceComponent?.skuVal?.actSkuMultiCurrencyCalPrice,
      run?.data?.priceComponent?.skuVal?.skuMultiCurrencyCalPrice,
      run?.data?.priceComponent?.skuVal?.skuCalPrice,
    ];

    for (const v of tryPaths) {
      if (typeof v === "string") {
        const num = Number(v.replace(/[^\d.]/g, ""));
        if (!Number.isNaN(num) && num > 0) {
          // currency might be in separate field
          const c =
            run?.data?.priceComponent?.currencyCode ||
            run?.data?.priceComponent?.skuVal?.actMultiCurrencyCode ||
            run?.data?.priceComponent?.skuVal?.multiCurrencyCode ||
            "USD";
          return { price: num, currency: String(c).toUpperCase() };
        }
      }
      if (typeof v === "number" && v > 0) {
        const c = run?.data?.priceComponent?.currencyCode || "USD";
        return { price: v, currency: String(c).toUpperCase() };
      }
    }
  }

  return { price: null, currency: null };
}

async function fetchAliProduct(url: string) {
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Act like a normal browser
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept-language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
    });

    const html = await res.text();
    if (!res.ok) {
      return { ok: false as const, status: res.status, body: html.slice(0, 2000) };
    }

    const title = parseTitle(html) ?? "AliExpress item";
    const { price, currency } = parsePrice(html);

    return {
      ok: true as const,
      data: {
        title,
        price: price ?? 0,
        currency: (currency || "USD").toUpperCase(),
      },
    };
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return { ok: false as const, status: 504, body: "AliExpress request timed out" };
    }
    return { ok: false as const, status: 502, body: e?.message || "AliExpress fetch failed" };
  } finally {
    clearTimeout(kill);
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await withTimeout(req.json(), 5_000, "parse JSON body");
  } catch (e: any) {
    return jsonError(e?.message || "Invalid JSON body", 400);
  }

  const input = body.url as string | undefined;

  // user_id optional; we read from cookies like your ebay route
  let userId = body.user_id as string | undefined;
  if (!userId) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id;
  }
  if (!userId) return jsonError("Not signed in", 401);

  if (!input) return jsonError("Missing url", 400);

  let url: string;
  try {
    url = normalizeAliUrl(input);
  } catch {
    return jsonError("Invalid URL", 400);
  }

  if (!/aliexpress\./i.test(url)) {
    return jsonError("Not an AliExpress URL", 400);
  }

  const itemId = extractAliItemId(url) || "";
  // 1) fetch product info (best-effort)
  const fetched = await fetchAliProduct(url);
  if (!fetched.ok) {
    return jsonError("Failed to fetch from AliExpress", fetched.status || 502, {
      ali_status: fetched.status,
      ali_body: fetched.body,
    });
  }

  const item = fetched.data;

  // 2) upsert tracked_products by (user_id + url)
  const existing = await withTimeout(
    exec(
      supabaseAdmin
        .from("tracked_products")
        .select("id")
        .eq("user_id", userId)
        .eq("url", url)
        .maybeSingle()
    ),
    8_000,
    "supabase select tracked_products"
  );

  let productId: string;

  if ((existing as any).data) {
    productId = (existing as any).data.id;

    await withTimeout(
      exec(
        supabaseAdmin
          .from("tracked_products")
          .update({
            title: item.title,
            sku: itemId || null,
            merchant: "aliexpress",
            locale: "WW",
            // no sold-out logic in v1
            is_sold_out: false,
            is_ended: false,
            status_message: null,
          })
          .eq("id", productId)
      ),
      8_000,
      "supabase update tracked_products"
    );
  } else {
    const inserted = await withTimeout(
      exec(
        supabaseAdmin
          .from("tracked_products")
          .insert({
            user_id: userId,
            url,
            title: item.title,
            merchant: "aliexpress",
            locale: "WW",
            sku: itemId || null,
            is_sold_out: false,
            is_ended: false,
            status_message: null,
          })
          .select()
          .single()
      ),
      10_000,
      "supabase insert tracked_products"
    );

    const insertError = (inserted as any).error;
    if (insertError || !(inserted as any).data) {
      return jsonError("Failed to save item", 500, { insertError });
    }

    productId = (inserted as any).data.id;
  }

  // 3) Insert snapshot (always)
  await withTimeout(
    exec(
      supabaseAdmin.from("price_snapshots").insert({
        product_id: productId,
        price: item.price,
        currency: item.currency,
      })
    ),
    10_000,
    "supabase insert price_snapshots"
  );

  return NextResponse.json({
    success: true,
    product_id: productId,
    merchant: "aliexpress",
  });
}
