"use client";

import { useState, useEffect } from "react";
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

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // ----------------------------------------------------------------------
  // Load currency + products on mount
  // ----------------------------------------------------------------------
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
          setDisplayCurrency(data.currency);
        }
      }

      await loadProducts();
    };

    load();
  }, []);

  // ----------------------------------------------------------------------
  // Update currency instantly + save to DB
  // ----------------------------------------------------------------------
  async function handleCurrencyChange(code: CurrencyCode) {
    setDisplayCurrency(code);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (user) {
      await supabase.from("user_profile").upsert({
        user_id: user.id,
        currency: code,
      });
    }

    toast.success(`Currency updated to ${code}`);
  }

  // ----------------------------------------------------------------------
  // Fetch user's tracked products
  // ----------------------------------------------------------------------
  async function loadProducts() {
    setLoadingProducts(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from("tracked_products")
        .select(`
          id,
          title,
          url,
          merchant,
          locale,
          sku,
          status,
          price_snapshots!inner (
            price,
            currency,
            seen_at
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false });

      if (error) throw error;

      const mapped = data.map((item: any) => {
        const snaps = [...item.price_snapshots].sort(
          (a, b) =>
            new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime()
        );

        const last = snaps[0] ?? null;

        return {
          ...item,
          latest_price: last?.price ?? null,
          currency: last?.currency ?? "GBP",
          seen_at: last?.seen_at ?? null,
          price_snapshots: snaps,
        };
      });

      setProducts(mapped);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load tracked items.");
    }

    setLoadingProducts(false);
  }

  // ----------------------------------------------------------------------
  // Track product
  // ----------------------------------------------------------------------
  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return toast.error("Please paste a product link.");

    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return toast.error("Please sign in first.");

      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_id: user.id }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      toast.success("Product added!");
      setUrl("");
      loadProducts();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ----------------------------------------------------------------------
  // Delete tracking
  // ----------------------------------------------------------------------
  async function handleDelete(id: string) {
    if (!confirm("Remove this item?")) return;

    const { error } = await supabase
      .from("tracked_products")
      .delete()
      .eq("id", id);

    if (!error) {
      toast.success("Removed.");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  // ----------------------------------------------------------------------
  // UI
  // ----------------------------------------------------------------------
  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">

      {/* Currency Selector (Header Only) */}
      <div className="mb-6">
        <select
          className="border p-2 rounded-md shadow-sm"
          value={displayCurrency}
          onChange={(e) =>
            handleCurrencyChange(e.target.value as CurrencyCode)
          }
        >
          {[...SUPPORTED_CURRENCIES].sort().map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <h1 className="text-3xl font-bold mb-4 text-blue-600">
        🔎 PriceScan — Track Product Prices
      </h1>

      {/* Track Form */}
      <form
        onSubmit={handleTrack}
        className="flex flex-col md:flex-row gap-3 w-full max-w-xl mx-auto mb-8"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link..."
          className="flex-1 p-3 border rounded-md shadow-sm"
        />

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </form>

      {/* Products */}
      {loadingProducts ? (
        <p className="text-gray-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">No items yet — track something!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);
            const hasPrice = item.latest_price !== null;

            // Convert price if needed
            let displayPrice = item.latest_price;
            let displayCode = item.currency;

            if (
              hasPrice &&
              isSupportedCurrency(item.currency) &&
              item.currency !== displayCurrency
            ) {
              displayPrice = convertCurrency(
                item.latest_price,
                item.currency as CurrencyCode,
                displayCurrency
              );
              displayCode = displayCurrency;
            }

            // Price drop detection
            let priceDropBlock = null;
            if (item.price_snapshots.length > 1) {
              const latest = item.price_snapshots[0].price;
              const prevLow = Math.min(
                ...item.price_snapshots.slice(1).map((s: any) => s.price)
              );

              if (latest < prevLow) {
                const diff = prevLow - latest;
                const pct = (diff / prevLow) * 100;

                priceDropBlock = (
                  <p className="text-sm text-green-600 font-semibold mb-2">
                    📉 Price dropped: {displayCode} {diff.toFixed(2)} (
                    -{pct.toFixed(1)}%)
                  </p>
                );
              }
            }

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col"
              >
                {/* Title */}
                <div className="h-[52px] mb-2 overflow-hidden">
                  <p className="font-semibold text-[18px] line-clamp-2">
                    {item.title}
                  </p>
                </div>

                {/* Status badges */}
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

                {/* Price */}
                {hasPrice ? (
                  <>
                    <p className="text-[26px] font-bold text-gray-900 mb-1">
                      {displayCode} {displayPrice.toFixed(2)}
                    </p>

                    {priceDropBlock}

                    {displayCode !== item.currency && (
                      <p className="text-xs text-gray-400 mb-1">
                        Original currency: {item.currency}{" "}
                        {item.latest_price.toFixed(2)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-blue-500 animate-pulse">
                    Fetching price…
                  </p>
                )}

                {/* Last updated */}
                {item.seen_at && (
                  <p className="text-xs text-gray-400 italic mb-4">
                    Updated{" "}
                    {new Date(item.seen_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}

                {/* Chart */}
                <button
                  onClick={() => {
                    setSelectedProduct(item);
                    setShowChart(true);
                  }}
                  className="text-blue-600 text-sm mb-4 hover:underline"
                >
                  📈 View Price History
                </button>

                {/* Buttons */}
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

      {/* Modal */}
      <Modal open={showChart} onClose={() => setShowChart(false)}>
        <h2 className="text-xl font-semibold mb-3">Price History</h2>
        <PriceHistoryChart
          snapshots={selectedProduct?.price_snapshots || []}
        />
      </Modal>
    </main>
  );
}
