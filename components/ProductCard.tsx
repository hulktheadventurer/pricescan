"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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

  // ✅ from tracked_products
  is_sold_out?: boolean | null;
  is_ended?: boolean | null;
  status_message?: string | null;

  currency?: string | null;
  price_currency?: string | null;
};

type SnapshotRow = {
  price?: number | null;
  seen_at?: string | null;
  currency?: string | null;
};

const AMAZON_TAG = "theforbiddens-21";

function buildAmazonSearchUrl(title: string | null | undefined) {
  const q = (title || "").trim();
  if (!q) return `https://www.amazon.co.uk/?tag=${AMAZON_TAG}`;
  return `https://www.amazon.co.uk/s?k=${encodeURIComponent(q)}&tag=${AMAZON_TAG}`;
}

function buildAliExpressSearchUrl(title: string | null | undefined) {
  const q = (title || "").trim();
  if (!q) return "https://www.aliexpress.com/";
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`;
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

export default function ProductCard({ product }: { product: TrackedProduct }) {
  const supabase = createClientComponentClient();

  const [busy, setBusy] = useState(false);

  // Selected display currency (from Header broadcast)
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  // Latest snapshot data
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

  // Listen to header currency changes
  useEffect(() => {
    const handler = (e: any) => {
      const code = e?.detail;
      if (code && isSupportedCurrency(code)) setDisplayCurrency(code);
    };
    window.addEventListener("pricescan-currency-update", handler as any);
    return () =>
      window.removeEventListener("pricescan-currency-update", handler as any);
  }, []);

  // Fetch latest snapshot
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
        // fallback without currency
        const retry = await supabase
          .from("price_snapshots")
          .select("price, seen_at")
          .eq("product_id", product.id)
          .order("seen_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setLatestPrice((retry.data as any)?.price ?? null);
          setLatestSeenAt((retry.data as any)?.seen_at ?? null);
          setLatestCurrency("GBP");
        }
        return;
      }

      const row = data as SnapshotRow | null;
      const rawCurrency = (row?.currency || "GBP").toUpperCase();
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

  // Convert snapshot price into selected display currency
  const convertedPrice = useMemo(() => {
    if (latestPrice == null) return null;
    return convertCurrency(latestPrice, latestCurrency, displayCurrency);
  }, [latestPrice, latestCurrency, displayCurrency]);

  const priceLabel = useMemo(() => {
    if (convertedPrice == null) return null;
    return fmt(convertedPrice, displayCurrency);
  }, [convertedPrice, displayCurrency]);

  // ✅ Badge logic from tracked_products
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

      window.dispatchEvent(new CustomEvent("pricescan-products-refresh"));
    } catch (e) {
      console.error(e);
      alert("Remove failed. Check console.");
    } finally {
      setBusy(false);
    }
  }

  function handleView() {
    if (product.url) window.open(product.url, "_blank", "noopener,noreferrer");
  }

  function handleAmazon() {
    window.open(amazonUrl, "_blank", "noopener,noreferrer");
  }

  function handleAli() {
    window.open(aliUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm relative">
      {/* ✅ Badge */}
      {badge && (
        <div
          className={`absolute top-4 right-4 text-xs font-semibold px-2 py-1 rounded-full ${badge.cls}`}
          title={product.status_message || undefined}
        >
          {badge.text}
        </div>
      )}

      <div className="font-semibold text-lg leading-snug mb-3 pr-20">
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
        <div className="text-xs text-gray-400 mb-3">
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

      <div className="flex gap-3">
        <button
          onClick={handleView}
          className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          View
        </button>

        <button
          onClick={handleAmazon}
          className="flex-1 bg-white border py-2 rounded hover:bg-gray-50"
          title="Search this item on Amazon"
        >
          Amazon
        </button>

        <button
          onClick={handleAli}
          className="flex-1 bg-white border py-2 rounded hover:bg-gray-50"
          title="Search this item on AliExpress"
        >
          AliExpress
        </button>

        <button
          onClick={handleRemove}
          disabled={busy}
          className="flex-1 bg-gray-200 py-2 rounded hover:bg-gray-300 disabled:opacity-60"
        >
          {busy ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
