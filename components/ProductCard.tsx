"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import {
  CurrencyCode,
  convertCurrency,
  isSupportedCurrency,
} from "@/lib/currency";

type TrackedProduct = {
  id: string;
  title?: string | null;
  url?: string | null;
  merchant?: string | null;
  sku?: string | null;

  is_sold_out?: boolean | null;
  is_ended?: boolean | null;
  status_message?: string | null;
};

type SnapshotRow = {
  price?: number | null;
  seen_at?: string | null;
  currency?: string | null;
};

// ✅ Affiliate env (client-side must be NEXT_PUBLIC_*)
const AMAZON_TAG = process.env.NEXT_PUBLIC_AMAZON_TAG || "theforbiddens-21";
const ALI_PREFIX = (process.env.NEXT_PUBLIC_ALI_DEEPLINK_PREFIX || "").trim();

// ✅ eBay EPN params (NEXT_PUBLIC required for client)
// Support multiple naming styles just in case you had older ones
const EBAY_CAMPID = (
  process.env.NEXT_PUBLIC_EBAY_CAMPID ||
  process.env.NEXT_PUBLIC_EBAY_CAMPAIGN_ID ||
  ""
).trim();

const EBAY_TOOLID = (process.env.NEXT_PUBLIC_EBAY_TOOLID || "10001").trim();

const EBAY_CUSTOMID = (
  process.env.NEXT_PUBLIC_EBAY_CUSTOMID ||
  process.env.NEXT_PUBLIC_EBAY_CUSTOM_ID ||
  ""
).trim();

function buildAmazonSearchUrl(title: string | null | undefined) {
  const q = (title || "").trim();
  if (!q) return `https://www.amazon.co.uk/?tag=${AMAZON_TAG}`;
  return `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}&tag=${AMAZON_TAG}`;
}

function aliDeeplink(targetUrl: string) {
  if (!ALI_PREFIX) return targetUrl;
  // Admitad-style: <prefix>?ulp=<encoded target url>
  const joiner = ALI_PREFIX.includes("?") ? "&" : "?";
  return `${ALI_PREFIX}${joiner}ulp=${encodeURIComponent(targetUrl)}`;
}

function buildAliExpressSearchUrl(title: string | null | undefined) {
  const q = (title || "").trim();
  const target = q
    ? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`
    : "https://www.aliexpress.com/";
  return aliDeeplink(target);
}

function fmt(amount: number, currency: CurrencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// ✅ Add EPN params to eBay URLs so "View" click can earn commission
function buildEbayAffiliateUrl(rawUrl: string, merchant?: string | null) {
  if (!rawUrl) return rawUrl;

  const m = (merchant || "").toLowerCase();
  const isEbay = m.includes("ebay") || /(^|\.)ebay\./i.test(rawUrl);

  // If not eBay or missing campid, just return original
  if (!isEbay || !EBAY_CAMPID) return rawUrl;

  try {
    const u = new URL(rawUrl);

    // Do not overwrite existing values if user already has them
    if (!u.searchParams.get("campid")) u.searchParams.set("campid", EBAY_CAMPID);
    if (EBAY_TOOLID && !u.searchParams.get("toolid"))
      u.searchParams.set("toolid", EBAY_TOOLID);

    if (EBAY_CUSTOMID && !u.searchParams.get("customid"))
      u.searchParams.set("customid", EBAY_CUSTOMID);

    return u.toString();
  } catch {
    // If URL parsing fails, fallback original
    return rawUrl;
  }
}

export default function ProductCard({ product }: { product: TrackedProduct }) {
  const supabase = createClientComponentClient();

  const [busy, setBusy] = useState(false);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [latestSeenAt, setLatestSeenAt] = useState<string | null>(null);
  const [latestCurrency, setLatestCurrency] = useState<CurrencyCode>("GBP");

  const amazonUrl = useMemo(
    () => buildAmazonSearchUrl(product?.title),
    [product?.title]
  );
  const aliUrl = useMemo(
    () => buildAliExpressSearchUrl(product?.title),
    [product?.title]
  );

  const viewUrl = useMemo(() => {
    if (!product?.url) return "";
    return buildEbayAffiliateUrl(product.url, product.merchant);
  }, [product?.url, product?.merchant]);

  useEffect(() => {
    const handler = (e: any) => {
      const code = String(e?.detail || "").toUpperCase();
      if (code && isSupportedCurrency(code)) setDisplayCurrency(code as CurrencyCode);
    };
    window.addEventListener("pricescan-currency-update", handler as any);
    return () => window.removeEventListener("pricescan-currency-update", handler as any);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      if (!product?.id) return;

      const { data, error } = await supabase
        .from("price_snapshots")
        .select("price, seen_at, currency")
        .eq("product_id", product.id)
        .order("seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        console.error("❌ loadLatest snapshot error:", error);
        return;
      }

      const row = data as SnapshotRow | null;
      const rawCurrency = String(row?.currency || "GBP").toUpperCase();
      const snapCurrency = isSupportedCurrency(rawCurrency)
        ? (rawCurrency as CurrencyCode)
        : "GBP";

      setLatestPrice(row?.price ?? null);
      setLatestSeenAt(row?.seen_at ?? null);
      setLatestCurrency(snapCurrency);
    }

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [product?.id, supabase]);

  const merchant = product.merchant || "ebay";
  const sku = product.sku || "";

  const convertedPrice = useMemo(() => {
    if (latestPrice == null) return null;
    return convertCurrency(latestPrice, latestCurrency, displayCurrency);
  }, [latestPrice, latestCurrency, displayCurrency]);

  const priceLabel = useMemo(() => {
    if (convertedPrice == null) return null;
    return fmt(convertedPrice, displayCurrency);
  }, [convertedPrice, displayCurrency]);

  const badge = useMemo(() => {
    if (product.is_ended) return { text: "Ended", cls: "bg-gray-900 text-white" };
    if (product.is_sold_out) return { text: "Sold out", cls: "bg-red-600 text-white" };
    return null;
  }, [product.is_ended, product.is_sold_out]);

  async function handleRemove() {
    if (!product?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("tracked_products")
        .delete()
        .eq("id", product.id);

      if (error) throw error;

      toast.success("Removed.");
      window.dispatchEvent(new CustomEvent("pricescan-products-refresh"));
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleView() {
    const target = viewUrl || product.url;
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  }
  function handleAmazon() {
    window.open(amazonUrl, "_blank", "noopener,noreferrer");
  }
  function handleAli() {
    window.open(aliUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm relative">
      {badge && (
        <div
          className={`absolute top-4 right-4 text-xs font-semibold px-2 py-1 rounded-full ${badge.cls}`}
          title={product.status_message || undefined}
        >
          {badge.text}
        </div>
      )}

      <div className="font-semibold text-base sm:text-lg leading-snug mb-3 pr-20">
        {product.title || "Untitled"}
      </div>

      <div className="text-2xl font-bold mb-1">
        {latestPrice == null ? (
          <span className="text-gray-400">No price yet</span>
        ) : (
          <span>{priceLabel}</span>
        )}
      </div>

      {latestSeenAt && (
        <div className="text-xs text-gray-400 mb-3 break-words">
          Updated: {new Date(latestSeenAt).toLocaleString("en-GB")}
        </div>
      )}

      <div className="text-sm text-gray-500 mb-4">
        Merchant: {merchant}
        {sku ? ` • SKU: ${sku}` : ""}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Link
          href={`/history?product_id=${product.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          📈 View Price History
        </Link>
      </div>

      {/* ✅ Mobile-friendly buttons:
          - 2 columns on mobile
          - 4 columns on desktop
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={handleView}
          className="h-11 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          View
        </button>

        <button
          onClick={handleAmazon}
          className="h-11 bg-white border rounded-lg hover:bg-gray-50"
          title="Search this item on Amazon (affiliate)"
        >
          Amazon
        </button>

        <button
          onClick={handleAli}
          className="h-11 bg-white border rounded-lg hover:bg-gray-50"
          title={ALI_PREFIX ? "Search on AliExpress (affiliate)" : "Search on AliExpress"}
        >
          AliExpress
        </button>

        <button
          onClick={handleRemove}
          disabled={busy}
          className="h-11 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-60"
        >
          {busy ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
