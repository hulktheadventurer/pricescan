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

  // optional if you ever store it on tracked_products
  is_sold_out?: boolean | null;
  sold_out?: boolean | null;
  in_stock?: boolean | null;
  availability?: string | null;
  stock?: number | null;
  quantity?: number | null;
};

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

function includesSoldOutText(s: string) {
  const t = s.toLowerCase();
  return (
    t.includes("sold out") ||
    t.includes("out of stock") ||
    t.includes("out_of_stock") ||
    t.includes("unavailable") ||
    t.includes("no longer available") ||
    t.includes("listing ended") ||
    t.includes("ended") ||
    t.includes("not available") ||
    t.includes("oos")
  );
}

// ✅ Generic sold-out detection that works even if your column names are unknown
function detectSoldOutAny(row: any): boolean {
  if (!row) return false;

  // common explicit flags
  if (row.is_sold_out === true || row.sold_out === true) return true;
  if (row.in_stock === false) return true;

  // common numeric stock fields
  if (typeof row.stock === "number" && row.stock <= 0) return true;
  if (typeof row.quantity === "number" && row.quantity <= 0) return true;

  // common string fields
  if (typeof row.availability === "string" && includesSoldOutText(row.availability)) return true;
  if (typeof row.status === "string" && includesSoldOutText(row.status)) return true;

  // fallback: scan ALL fields
  for (const [key, val] of Object.entries(row)) {
    if (val == null) continue;

    // if any boolean field looks like a stock flag and is false
    if (typeof val === "boolean") {
      const k = key.toLowerCase();
      if (
        (k.includes("stock") || k.includes("available") || k.includes("availability") || k.includes("in_stock")) &&
        val === false
      ) {
        return true;
      }
    }

    // if any number field looks like quantity/stock and is 0
    if (typeof val === "number") {
      const k = key.toLowerCase();
      if ((k.includes("qty") || k.includes("quantity") || k.includes("stock")) && val <= 0) {
        return true;
      }
    }

    // if any string contains sold-out keywords
    if (typeof val === "string" && includesSoldOutText(val)) {
      return true;
    }
  }

  return false;
}

export default function ProductCard({ product }: { product: TrackedProduct }) {
  const supabase = createClientComponentClient();

  const [busy, setBusy] = useState(false);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [latestSeenAt, setLatestSeenAt] = useState<string | null>(null);
  const [latestCurrency, setLatestCurrency] = useState<CurrencyCode>("GBP");

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

  // Fetch latest snapshot using select("*") so we never miss column names
  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      if (!product?.id) return;

      // fallback from tracked_products if you store state there
      const fallbackSold =
        product.is_sold_out === true ||
        product.sold_out === true ||
        product.in_stock === false ||
        (typeof product.stock === "number" && product.stock <= 0) ||
        (typeof product.quantity === "number" && product.quantity <= 0) ||
        (typeof product.availability === "string" && includesSoldOutText(product.availability));

      setSoldOut(fallbackSold);

      const { data, error } = await supabase
        .from("price_snapshots")
        .select("*")
        .eq("product_id", product.id)
        .order("seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("snapshot fetch error:", error.message);
        return;
      }

      const row: any = data || null;

      setLatestPrice(typeof row?.price === "number" ? row.price : null);
      setLatestSeenAt(typeof row?.seen_at === "string" ? row.seen_at : null);

      const rawCurrency = String(row?.currency || "GBP").toUpperCase();
      const snapCurrency = isSupportedCurrency(rawCurrency)
        ? (rawCurrency as CurrencyCode)
        : "GBP";
      setLatestCurrency(snapCurrency);

      const snapSold = detectSoldOutAny(row);
      setSoldOut(snapSold || fallbackSold);
    }

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [product?.id, supabase, product]);

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
