"use client";

import { useEffect, useState } from "react";
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

type Snapshot = {
  price: number;
  currency: string;
  seen_at: string;
};

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [userId, setUserId] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  function detectMerchant(link: string) {
    if (link.includes("ebay.")) return "ebay";
    if (link.includes("amazon.")) return "amazon";
    return "unknown";
  }

  // Listen for header currency updates
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce?.detail && isSupportedCurrency(ce.detail)) {
        setDisplayCurrency(ce.detail as CurrencyCode);
      }
    };

    window.addEventListener("pricescan-currency-update", handler);
    return () => window.removeEventListener("pricescan-currency-update", handler);
  }, []);

  // Load auth + currency pref + products
  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user ?? null;
      setUserId(user?.id ?? null);

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

      await loadProducts(user?.id ?? null);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts(uid: string | null) {
    setLoadingProducts(true);

    try {
      if (!uid) {
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
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false });

      if (error) throw error;

      const mapped = (data ?? []).map((item: any) => {
        const snaps: Snapshot[] = [...(item.price_snapshots ?? [])].sort(
          (a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime()
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

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();

    if (!url.trim()) return toast.error("Please paste a product link first.");

    const merchant = detectMerchant(url);
    if (merchant !== "ebay") {
      toast.warning("Supports eBay only. Amazon coming soon.");
      return;
    }

    if (!userId) {
      toast.error("Please sign in first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_id: userId }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.error === "GROUP_LISTING") {
          toast.warning(
            "This listing has variations. Select a specific option and paste that URL."
          );
          return;
        }
        throw new Error(result.error || "Failed to track");
      }

      toast.success("🎉 Product added!");
      setUrl("");
      await loadProducts(userId);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Could not start tracking.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Stop tracking this item?")) return;

    const { error } = await supabase.from("tracked_products").delete().eq("id", id);

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
        🔎 PriceScan — Track Product Prices
      </h1>

      {!userId && (
        <p className="text-sm text-red-600 mb-4">
          You’re not signed in — tracking is disabled until you log in.
        </p>
      )}

      <form
        onSubmit={handleTrack}
        className="flex flex-col md:flex-row gap-3 w-full max-w-xl mx-auto mb-8"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link..."
          className="flex-1 p-3 border rounded-md shadow-sm bg-white"
          required
        />

        <button
          type="submit"
          disabled={loading || !userId}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </form>

      {loadingProducts ? (
        <p className="text-gray-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">No items yet — track something!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);

            const hasPrice = item.latest_price !== null;

            let displayPrice = item.latest_price as number | null;
            let displayCode = item.currency as string;

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

            // price drop block (typed)
            let priceDropBlock: JSX.Element | null = null;
            const snaps: Snapshot[] = item.price_snapshots ?? [];
            if (snaps.length > 1) {
              const latest = snaps[0].price;
              const prevLow = Math.min(...snaps.slice(1).map((s: Snapshot) => s.price));
              if (latest < prevLow) {
                const diff = prevLow - latest;
                const pct = (diff / prevLow) * 100;
                priceDropBlock = (
                  <p className="text-sm text-green-600 font-semibold mb-2">
                    📉 Price dropped: {displayCode} {diff.toFixed(2)} (-{pct.toFixed(1)}%)
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
                    {item.title || "Loading…"}
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

                {hasPrice && displayPrice != null ? (
                  <>
                    <p className="text-[26px] font-bold text-gray-900 mb-1">
                      {displayCode} {displayPrice.toFixed(2)}
                    </p>

                    {priceDropBlock}

                    {displayCode !== item.currency && (
                      <p className="text-xs text-gray-400 mb-1">
                        Price in original currency: {item.currency}{" "}
                        {Number(item.latest_price).toFixed(2)}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-blue-500 animate-pulse">Fetching price…</p>
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
                  className="text-blue-600 text-sm mb-4 hover:underline"
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
