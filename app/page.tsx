"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";
import Modal from "@/components/Modal";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import {
  CurrencyCode,
  convertCurrency,
  isSupportedCurrency,
  SUPPORTED_CURRENCIES,
} from "@/lib/currency";

type Snapshot = {
  price: number;
  currency: string;
  seen_at: string;
};

type ProductRow = {
  id: string;
  title: string | null;
  url: string;
  merchant: string | null;
  locale: string | null;
  sku: string | null;
  status: "ACTIVE" | "SOLD_OUT" | "ENDED" | "UNKNOWN" | null;
  price_snapshots: Snapshot[];
  latest_price: number | null;
  currency: string;
  seen_at: string | null;
};

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);

  const [trackStatus, setTrackStatus] = useState<string>("");

  const sortedCurrencies = useMemo(
    () => [...SUPPORTED_CURRENCIES].sort((a, b) => a.localeCompare(b)),
    []
  );

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (user) {
        const { data } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data?.currency && isSupportedCurrency(data.currency)) {
          setDisplayCurrency(data.currency as CurrencyCode);
        }
      }

      await loadProducts();
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const next = ce.detail;
      if (next && isSupportedCurrency(next)) {
        setDisplayCurrency(next as CurrencyCode);
      }
    };

    window.addEventListener("pricescan-currency-update", handler as EventListener);
    return () => {
      window.removeEventListener("pricescan-currency-update", handler as EventListener);
    };
  }, []);

  async function loadProducts() {
    setLoadingProducts(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        setProducts([]);
        setLoadingProducts(false);
        return;
      }

      // ✅ IMPORTANT FIX: remove !inner so products with 0 snapshots still show
      const { data, error } = await supabase
        .from("tracked_products")
        .select(
          `
            id,
            title,
            url,
            merchant,
            locale,
            sku,
            status,
            price_snapshots (
              price,
              currency,
              seen_at
            )
          `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false });

      if (error) throw error;

      const mapped: ProductRow[] = (data || []).map((item: any) => {
        const snaps: Snapshot[] = Array.isArray(item.price_snapshots)
          ? [...item.price_snapshots]
          : [];

        snaps.sort(
          (a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime()
        );

        const last = snaps[0] ?? null;

        return {
          id: item.id,
          title: item.title ?? null,
          url: item.url,
          merchant: item.merchant ?? null,
          locale: item.locale ?? null,
          sku: item.sku ?? null,
          status: item.status ?? null,
          price_snapshots: snaps,
          latest_price: last?.price ?? null,
          currency: last?.currency ?? "GBP",
          seen_at: last?.seen_at ?? null,
        };
      });

      setProducts(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load tracked items.");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function trackNow() {
    const link = url.trim();

    if (!link) {
      toast.error("Please paste a product link.");
      setTrackStatus("❌ Please paste a product link.");
      return;
    }

    setLoading(true);
    setTrackStatus("⏳ Sending…");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        toast.error("Please sign in first.");
        setTrackStatus("❌ Not signed in.");
        return;
      }

      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, user_id: user.id }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(result?.error || `Track failed (${res.status})`);

      toast.success("✅ Product added!");
      setTrackStatus("✅ Product added!");
      setUrl("");
      await loadProducts();
    } catch (err: any) {
      console.error("❌ Track error:", err);
      toast.error(err?.message || "Could not start tracking.");
      setTrackStatus(`❌ ${err?.message || "Could not start tracking."}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    await trackNow();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item?")) return;

    const { error } = await supabase.from("tracked_products").delete().eq("id", id);

    if (error) {
      toast.error("Delete failed.");
      return;
    }

    toast.success("Removed.");
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">
      <h1 className="text-3xl font-bold mb-6 text-blue-600">
        🔎 PriceScan — Track Product Prices
      </h1>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col md:flex-row gap-3 w-full max-w-xl mx-auto mb-3"
      >
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link..."
          className="flex-1 p-3 border rounded-md shadow-sm"
        />

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </form>

      {trackStatus ? (
        <p className="text-sm text-gray-500 mb-5">{trackStatus}</p>
      ) : (
        <div className="mb-5" />
      )}

      {loadingProducts ? (
        <p className="text-gray-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">No items yet — track something!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);
            const hasPrice = item.latest_price !== null;

            let displayPrice = item.latest_price ?? 0;
            let displayCode: string = item.currency || "GBP";

            if (
              hasPrice &&
              isSupportedCurrency(item.currency) &&
              isSupportedCurrency(displayCurrency) &&
              item.currency !== displayCurrency
            ) {
              displayPrice = convertCurrency(
                item.latest_price as number,
                item.currency as CurrencyCode,
                displayCurrency
              );
              displayCode = displayCurrency;
            }

            let priceDropBlock: JSX.Element | null = null;
            if (item.price_snapshots.length > 1) {
              const latest = item.price_snapshots[0].price;
              const prevLow = Math.min(
                ...item.price_snapshots.slice(1).map((s: Snapshot) => s.price)
              );

              if (latest < prevLow) {
                const diff = prevLow - latest;
                const pct = (diff / prevLow) * 100;

                priceDropBlock = (
                  <p className="text-sm text-green-600 font-semibold mb-2">
                    📉 Price drop: -{item.currency} {diff.toFixed(2)} (-{pct.toFixed(1)}%)
                  </p>
                );
              }
            }

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col"
              >
                <div className="h-[52px] mb-2 overflow-hidden">
                  <p className="font-semibold text-[18px] line-clamp-2">
                    {item.title || "Untitled"}
                  </p>
                </div>

                {item.status === "SOLD_OUT" && (
                  <span className="inline-block mb-2 px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded">
                    SOLD OUT
                  </span>
                )}
                {item.status === "ENDED" && (
                  <span className="inline-block mb-2 px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-600 rounded">
                    LISTING ENDED
                  </span>
                )}

                {hasPrice ? (
                  <>
                    <p className="text-[26px] font-bold text-gray-900 mb-1">
                      {displayCode} {displayPrice.toFixed(2)}
                    </p>

                    {priceDropBlock}

                    {displayCode !== item.currency && (
                      <p className="text-xs text-gray-400 mb-1">
                        Price in original currency: {item.currency}{" "}
                        {(item.latest_price as number).toFixed(2)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-blue-500 animate-pulse">No price yet (sold out/ended or pending)</p>
                )}

                {item.seen_at && (
                  <p className="text-xs text-gray-400 italic mb-4">
                    Updated{" "}
                    {new Date(item.seen_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}

                <button
                  onClick={() => {
                    setSelectedProduct(item);
                    setShowChart(true);
                  }}
                  className="text-blue-600 text-sm mb-4 hover:underline text-left"
                >
                  📈 View Price History
                </button>

                <div className="mt-auto flex gap-3">
                  <a
                    href={affiliateUrl}
                    target="_blank"
                    className="flex-1 text-center bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
                  >
                    View
                  </a>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-md hover:bg-gray-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showChart} onClose={() => setShowChart(false)}>
        <h2 className="text-xl font-semibold mb-3">Price History</h2>
        <PriceHistoryChart snapshots={selectedProduct?.price_snapshots || []} />
      </Modal>
    </main>
  );
}
