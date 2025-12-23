"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { CurrencyCode, isSupportedCurrency } from "@/lib/currency";

type TrackedProduct = {
  id: string;
  title?: string | null;
  url?: string | null;
  merchant?: string | null;
  sku?: string | null;

  // optional legacy fields (ignore if not present)
  price?: number | null;
  current_price?: number | null;
  last_price?: number | null;
  latest_price?: number | null;

  currency?: string | null;
  price_currency?: string | null;
};

type SnapshotRow = {
  price?: number | null;
  seen_at?: string | null;
  currency?: string | null;
};

function fmt(amount: number, currency: string) {
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
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [latestCurrency, setLatestCurrency] = useState<CurrencyCode | null>(null);
  const [latestSeenAt, setLatestSeenAt] = useState<string | null>(null);

  // Listen to header currency changes (broadcast)
  useEffect(() => {
    const handler = (e: any) => {
      const code = e?.detail;
      if (code && isSupportedCurrency(code)) setDisplayCurrency(code);
    };
    window.addEventListener("pricescan-currency-update", handler as any);
    return () =>
      window.removeEventListener("pricescan-currency-update", handler as any);
  }, []);

  // Fetch latest snapshot price (THIS is the fix)
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
        // If your snapshots table doesn't have "currency", this might error on select.
        // Fallback: retry without currency.
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
          setLatestCurrency(null);
        }
        return;
      }

      const row = data as SnapshotRow | null;
      setLatestPrice(row?.price ?? null);
      setLatestSeenAt(row?.seen_at ?? null);

      const c = (row?.currency || "").toUpperCase();
      setLatestCurrency(isSupportedCurrency(c) ? (c as CurrencyCode) : null);
    }

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [product?.id, supabase]);

  const baseCurrency = useMemo<CurrencyCode>(() => {
    const c = (product.currency || product.price_currency || "GBP").toUpperCase();
    return isSupportedCurrency(c) ? (c as CurrencyCode) : "GBP";
  }, [product]);

  // Prefer latest snapshot price; fallback to any legacy field if present
  const price = useMemo(() => {
    return (
      latestPrice ??
      product.price ??
      product.current_price ??
      product.last_price ??
      product.latest_price ??
      null
    );
  }, [latestPrice, product]);

  const priceCurrency = useMemo<CurrencyCode>(() => {
    // If snapshot has a currency, use it; otherwise use product/base
    return latestCurrency ?? baseCurrency;
  }, [latestCurrency, baseCurrency]);

  const merchant = product.merchant || "ebay";
  const sku = product.sku || "";

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

  // NOTE: this displays in chosen header currency code (no FX conversion).
  // Same behaviour as your previous UI vibe, just not doing real conversion.
  const priceLabel =
    price == null ? null : fmt(price, displayCurrency || priceCurrency);

  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm">
      <div className="font-semibold text-lg leading-snug mb-3">
        {product.title || "Untitled"}
      </div>

      <div className="text-2xl font-bold mb-1">
        {price == null ? (
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
