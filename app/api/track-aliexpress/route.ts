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

async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
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

function extractAliItemId(url: string): string | null {
  const m = url.match(/\/item\/(\d+)\.html/i);
  return m?.[1] ?? null;
}

/**
 * Normalize AliExpress URL for dedupe.
 * Keep only: https://www.aliexpress.com/item/<id>.html
 */
function normalizeAliUrl(input: string) {
  const u = new URL(input);
  const itemId = extractAliItemId(u.toString());
  if (!itemId) return u.origin + u.pathname; // fallback

  // Always canonicalize to standard domain + path
  return `https://www.aliexpress.com/item/${itemId}.html`;
}

/**
 * AliExpress uses cookies to decide region/currency/locale.
 * This is best-effort. Ali may still override based on other factors.
 */
function buildAliCookie(shipCountry: string, currency: string) {
  const cc = (shipCountry || "GB").toUpperCase();
  const cur = (currency || "USD").toUpperCase();

  // Map ship country -> a reasonable Ali locale
  const locale =
    cc === "GB" ? "en_GB"
    : cc === "US" ? "en_US"
    : cc === "CA" ? "en_CA"
    : cc === "AU" ? "en_AU"
    : cc === "DE" ? "de_DE"
    : cc === "FR" ? "fr_FR"
    : cc === "ES" ? "es_ES"
    : cc === "IT" ? "it_IT"
    : "en_US";

  // aep_usuc_f controls region/currency/locale on many Ali pages
  // NOTE: Ali may change these formats; this is a pragmatic baseline.
  return `aep_usuc_f=site=glo&c_tp=${encodeURIComponent(
    cur
  )}&region=${encodeURIComponent(cc)}&b_locale=${encodeURIComponent(locale)}`;
}

function parseFromRunParams(html: string) {
  const idx = html.indexOf("window.runParams");
  if (idx === -1) return null;

  const slice = html.slice(idx, idx + 200000);
  const eq = slice.indexOf("=");
  if (eq === -1) return null;

  const afterEq = slice.slice(eq + 1);
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
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ?? null;
}

function parseTitle(html: string): string | null {
  const og = parseMeta(html, "og:title");
  if (og) return og;

  const m = html.match(/<title[^>]*>(.*?)<\/title>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function parsePrice(html: string): { price: number | null; currency: string | null } {
  // Meta tags if present
  const amount = parseMeta(html, "product:price:amount");
  const curr = parseMeta(html, "product:price:currency");

  if (amount && !Number.isNaN(Number(amount))) {
    return { price: Number(amount), currency: (curr || "USD").toUpperCase() };
  }

  // runParams fallback
  const run = parseFromRunParams(html);
  if (run) {
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

async function fetchAliProduct(opts: {
  url: string;
  shipCountry: string;
  currency: string;
}) {
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(opts.url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept-language": "en-GB,en;q=0.9",
        // Best-effort region/currency forcing:
        cookie: buildAliCookie(opts.shipCountry, opts.currency),
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
        price: price, // can be null
        currency: (currency || opts.currency || "USD").toUpperCase(),
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

  // user_id optional; read from cookies
  let userId = body.user_id as string | undefined;
  if (!userId) {
    const supabase = createRouteHandlerClient({ cookies });
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id;
  }
  if (!userId) return jsonError("Not signed in", 401);

  if (!input) return jsonError("Missing url", 400);

  // Load user preferences: ship_country + currency
  const profile = await withTimeout(
    exec(
      supabaseAdmin
        .from("user_profile")
        .select("ship_country, currency")
        .eq("user_id", userId)
        .maybeSingle()
    ),
    8_000,
    "supabase select user_profile"
  );

  const shipCountry =
    ((profile as any)?.data?.ship_country as string | null)?.toUpperCase() || "GB";
  const currency =
    String(((profile as any)?.data?.currency as string | null) || "USD").toUpperCase();

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

  // 1) fetch product info (best-effort, region-aware)
  const fetched = await fetchAliProduct({ url, shipCountry, currency });
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
            ship_country: shipCountry,

            // v1: no availability parsing yet
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
            ship_country: shipCountry,
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

  // 3) Insert snapshot (per ship country)
  // If we fail to find a price, store NULL so history shows "no price" instead of 0
  await withTimeout(
    exec(
      supabaseAdmin.from("price_snapshots").insert({
        product_id: productId,
        ship_country: shipCountry,
        price: item.price ?? null,
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
    ship_country: shipCountry,
    currency,
  });
}
