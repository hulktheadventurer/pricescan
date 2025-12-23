"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import {
  CurrencyCode,
  formatMoney,
  isSupportedCurrency,
} from "@/lib/currency";

type TrackedProduct = {
  id: string;
  title?: string | null;
  url?: string | null;
  merchant?: string | null;
  sku?: string | null;

  // possible price fields (depending on your schema)
  price?: number | null;
  current_price?: number | null;
  last_price?: number | null;
  latest_price?: number | null;

  currency?: string | null;
  price_currency?: string | null;
};

export default function ProductCard({ product }: { product: TrackedProduct }) {
  const supabase = createClientComponentClient();

  const [busy, setBusy] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  // Listen to header currency changes (broadcast)
  useEffect(() => {
    const handler = (e: any) => {
      const code = e?.detail;
      if (code && isSupportedCurrency(code)) setDisplayCurrency(code);
    };
    window.addEventListener("pricescan-currency-update", handler as any);
    return () => window.removeEventListener("pricescan-currency-update", handler as any);
  }, []);

  const price = useMemo(() => {
    return (
      product.price ??
      product.current_price ??
      product.last_price ??
      product.latest_price ??
      null
    );
  }, [product]);

  const baseCurrency = useMemo<CurrencyCode>(() => {
    const c = (product.currency || product.price_currency || "GBP").toUpperCase();
    return isSupportedCurrency(c) ? (c as CurrencyCode) : "GBP";
  }, [product]);

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

      // tell home page to reload list
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
    <div className="bg-white border rounded-2xl p-5 shadow-sm">
      <div className="font-semibold text-lg leading-snug mb-3">
        {product.title || "Untitled"}
      </div>

      <div className="text-2xl font-bold mb-3">
        {price == null ? (
          <span className="text-gray-400">No price yet</span>
        ) : (
          <span>
            {formatMoney(price, baseCurrency, displayCurrency)}
          </span>
        )}
      </div>

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
