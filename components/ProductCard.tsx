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
  currency?: string | null;
  price_currency?: string | null;

  // optional (in case you store it on tracked_products)
  availability?: string | null;
  in_stock?: boolean | null;
  is_sold_out?: boolean | null;
  sold_out?: boolean | null;
  stock?: number | null;
  quantity?: number | null;
};

type SnapshotRowAny = Record<string, any>;

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

function looksSoldOutFromValue(v: any): boolean {
  if (v == null) return false;

  if (typeof v === "boolean") {
    // if field is in_stock => false means sold out
    return v === false;
  }

  if (typeof v === "number") {
    // 0 stock/qty means sold out
    return v <= 0;
  }

  if (typeof v === "string") {
    const s = v.toLowerCase();
    return (
      s.includes("sold out") ||
      s.includes("out of stock") ||
      s.includes("out_of_stock") ||
      s.includes("oos") ||
      s.includes("unavailable") ||
      s.includes("ended") ||
      s.includes("no longer available")
    );
  }

  return false;
}

function detectSoldOut(row: any): boolean {
  // direct booleans first
  if (row?.is_sold_out === true || row?.sold_out === true) return true;

  // in_stock false
  if (row?.in_stock === false) return true;

  // quantity/stock 0
  if (typeof row?.stock === "number" && row.stock <= 0) return true;
  if (typeof row?.quantity === "number" && row.quantity <= 0) return true;

  // availability/status strings
  if (looksSoldOutFromValue(row?.availability)) return true;
  if (looksSoldOutFromValue(row?.status)) return true;

  return false;
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

  // Sold out flag (from snapshot or tracked_products fallback)
  const [soldOut, setSoldOut] = useState<boolean>(false);

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

  // Fetch latest snapshot (price + optional availability fields if present)
  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      if (!product?.id) return;

      // baseline soldOut from product fields (if you store it there)
      const fallbackSold =
        detectSoldOut(product) ||
        product?.is_sold_out === true ||
        product?.sold_out === true;
      setSoldOut(fallbackSold);

      // Try selecting extra fields; if they don't exist, retry smaller selects
      const tries: string[] = [
        // most likely / common
        "price, seen_at, currency, availability, in_stock, is_sold_out, sold_out, stock, quantity, status",
        // medium
        "price, seen_at, currency, availability, in_stock, stock, quantity, status",
        // minimal + availability
        "price, seen_at, currency, availability",
        // minimal
        "price, seen_at, currency",
        // minimal (no currency)
        "price, seen_at",
      ];

      for (const sel of tries) {
        const { data, error } = await supabase
          .from("price_snapshots")
          .select(sel)
          .eq("product_id", product.id)
          .order("seen_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // try next select variant
          continue;
        }

        const row = (data || null) as SnapshotRowAny | null;

        // price + time
        setLatestPrice((row as any)?.price ?? null);
        setLatestSeenAt((row as any)?.seen_at ?? null);

        // currency (optional)
        const rawCurrency = ((row as any)?.currency || "GBP").toUpperCase();
        const snapCurrency = isSupportedCurrency(rawCurrency)
          ? (rawCurrency as CurrencyCode)
          : "GBP";
        setLatestCurrency(snapCurrency);

        // sold out detection from snapshot (overrides fallback if true)
        const snapSold = detectSoldOut(row);
        setSoldOut(snapSold || fallbackSold);

        // success, stop trying
        return;
      }

      // If all snapshot selects failed, keep fallback from product
      return;
    }

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [product?.id, supabase, product]);

  const merchant = product.merchant || "ebay";
  const sku = product.sku || "";

  // Convert snapshot price into selected display currency (GBP pivot in your util)
  const convertedPrice = useMemo(() => {
    if (latestPrice == null) return null;
    return convertCurrency(latestPrice, latestCurrency, displayCurrency);
  }, [latestPrice, latestCurrency, displayCurrency]);

  const priceLabel = useMemo(() => {
    if (convertedPrice == null) return null;
    return fmt(convertedPrice, displayCurrency);
  }, [convertedPrice, displayCurrency]);

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

  return (
    <div className="relative bg-white border rounded-2xl p-5 shadow-sm">
      {/* SOLD OUT badge */}
      {soldOut && (
        <div className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
          SOLD OUT
        </div>
      )}

      <div className="font-semibold text-lg leading-snug mb-3 pr-24">
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
