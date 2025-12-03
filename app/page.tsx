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
} from "@/lib/currency";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const supabase = createClientComponentClient();

  function detectMerchant(link: string) {
    if (link.includes("ebay.")) return "ebay";
    if (link.includes("amazon.")) return "amazon";
    return "unknown";
  }

  // Load user currency + products at start
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
          price_snapshots!inner (
            price,
            currency,
            seen_at
          )
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("seen_at", {
          foreignTable: "price_snapshots",
          ascending: false,
        });

      if (error) throw error;

      const mapped = data.map((item: any) => {
        const snaps = item.price_snapshots || [];
        snaps.sort(
          (a: any, b: any) =>
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

  // Track product
  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return toast.error("Please paste a product link first.");

    setLoading(true);

    try {
      const merchant = detectMerchant(url);
      if (merchant !== "ebay") {
        toast.warning("Supports eBay only. Amazon & AliExpress coming soon!");
        setLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) {
        toast.error("Please sign in first.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_id: user.id }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.error === "GROUP_LISTING") {
          toast.warning(
            "This listing has variations. Select a specific model/colour/storage and paste that URL instead."
          );
          return;
        }
        throw new Error(result.error || "API error");
      }

      toast.success("🎉 Product added!");
      setUrl("");
      loadProducts();
    } catch (err: any) {
      console.error("❌ Add product failed:", err.message);
      toast.error(err.message || "Could not start tracking.");
    } finally {
      setLoading(false);
    }
  }

  // Delete tracked product
  async function handleDelete(id: string) {
    if (!confirm("Stop tracking this item?")) return;

    const { error } = await supabase
      .from("tracked_products")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Delete failed.");
    } else {
      toast.success("Tracking stopped.");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">
      <h1 className="text-3xl font-bold mb-4 text-blue-600">
        🔎 PriceScan — Track Product Prices Instantly
      </h1>

      {/* Removed currency selector from here */}

      {/* Input */}
      <form
        onSubmit={handleTrack}
        className="flex flex-col md:flex-row gap-3 w-full max-w-xl mx-auto mb-8"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link..."
          className="flex-1 p-3 border rounded-md shadow-sm bg-white focus:ring-2 focus:ring-blue-500"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </form>

      <p className="text-gray-500 text-sm mb-10">
        Works with <b>eBay</b> today.
        <br />
        <span className="text-gray-400">
          Amazon & AliExpress coming soon.
        </span>
      </p>

      {/* Product grid */}
      {loadingProducts ? (
        <p className="text-gray-400">Loading your tracked items…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">
          You’re not tracking any products yet. <br />
          <span className="text-gray-400">
            Paste a link above to start tracking!
          </span>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);

            const hasPrice = item.latest_price !== null;

            let displayCode: string = item.currency || "GBP";
            let displayPrice: number | null = hasPrice ? item.latest_price : null;

            if (
              hasPrice &&
              isSupportedCurrency(item.currency) &&
              isSupportedCurrency(displayCurrency) &&
              item.currency !== displayCurrency
            ) {
              displayPrice = convertCurrency(
                item.latest_price,
                item.currency as CurrencyCode,
                displayCurrency
              );
              displayCode = displayCurrency;
            }

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-all p-6 flex flex-col justify-between h-[360px]"
              >
                {/* Title */}
                <div className="h-[52px] mb-2 overflow-hidden">
                  <p className="font-semibold text-[18px] text-gray-900 line-clamp-2 leading-tight">
                    {item.title?.trim() || "Loading…"}
                  </p>
                </div>

                {/* Merchant */}
                <p className="text-sm text-gray-400 mb-1">
                  {item.merchant || "ebay"}
                </p>

                {/* Price */}
                {hasPrice && displayPrice !== null ? (
                  <>
                    <p className="text-[26px] font-bold text-gray-900 mb-1">
                      {displayCode} {displayPrice.toFixed(2)}
                    </p>

                    {displayCode !== item.currency && (
                      <p className="text-xs text-gray-400 mb-1">
                        Original: {item.currency}{" "}
                        {Number(item.latest_price).toFixed(2)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-blue-500 mb-1 animate-pulse">
                    Fetching price…
                  </p>
                )}

                {/* Timestamp */}
                {item.seen_at && (
                  <p className="text-xs text-gray-400 italic mb-4">
                    Updated{" "}
                    {new Date(item.seen_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}

                {/* Status badges */}
                {item.status === "SOLD_OUT" && (
                  <p className="text-red-600 text-sm font-semibold mb-2">
                    ❌ SOLD OUT
                  </p>
                )}

                {item.status === "ENDED" && (
                  <p className="text-gray-500 text-sm font-semibold mb-2">
                    🔚 Listing Ended
                  </p>
                )}

                {/* Price History */}
                <button
                  onClick={() => {
                    setSelectedProduct(item);
                    setShowChart(true);
                  }}
                  className="text-blue-600 font-medium hover:underline text-sm mb-4 text-left"
                >
                  📈 View Price History
                </button>

                {/* Buttons */}
                <div className="mt-auto flex gap-3">
                  <a
                    href={affiliateUrl}
                    target="_blank"
                    className="flex-1 text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                  >
                    View
                  </a>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition"
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

        <p className="mt-4 text-gray-400 text-xs text-center">
          Chart updates automatically as PriceScan collects more data.
        </p>
      </Modal>
    </main>
  );
}
