"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";
import Modal from "@/components/Modal";
import PriceHistoryChart from "@/components/PriceHistoryChart";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const supabase = createClientComponentClient();

  function detectMerchant(link: string) {
    if (link.includes("ebay.")) return "ebay";
    if (link.includes("amazon.")) return "amazon";
    return "unknown";
  }

  // Load tracked products
  useEffect(() => {
    loadProducts();
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

  // ============================================================
  //  TRACK PRODUCT  — FIXED VERSION WITH CORRECT user_id
  // ============================================================
  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return toast.error("Please paste a product link first.");

    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        toast.error("Please sign in first.");
        setLoading(false);
        return;
      }

      const merchant = detectMerchant(url);
      if (merchant !== "ebay") {
        toast.warning("Supports eBay only. Amazon & AliExpress coming soon!");
        setLoading(false);
        return;
      }

      // ⭐ THE FIX: clean body, send correct user_id
      const res = await fetch("/api/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url,
          user_id: user.id
        })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Track failed");
      }

      toast.success("🎉 Product added!");
      setUrl("");
      loadProducts();

    } catch (err: any) {
      console.error("❌ Add product failed:", err);
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
        <span className="text-gray-400">Amazon & AliExpress coming soon.</span>
      </p>

      {/* PRODUCT GRID */}
      {loadingProducts ? (
        <p className="text-gray-400">Loading your tracked items…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">
          You’re not tracking any products yet. <br />
          <span className="text-gray-400">Paste a link above to start tracking!</span>
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);

            return (
              <div
                key={item.id}
                className="
                  bg-white 
                  rounded-2xl 
                  shadow-sm 
                  border 
                  border-gray-100 
                  hover:shadow-lg 
                  transition-all 
                  p-6 
                  flex 
                  flex-col 
                  justify-between 
                  h-[340px]
                "
              >
                <div className="h-[52px] mb-2 overflow-hidden">
                  <p className="font-semibold text-[18px] text-gray-900 line-clamp-2 leading-tight">
                    {item.title?.trim() || "Loading…"}
                  </p>
                </div>

                <p className="text-sm text-gray-400 mb-1">{item.merchant}</p>

                {item.latest_price !== null ? (
                  <p className="text-[26px] font-bold text-gray-900 mb-1">
                    {item.currency} {item.latest_price.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-sm text-blue-500 mb-1 animate-pulse">
                    Fetching price…
                  </p>
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
                  className="text-blue-600 font-medium hover:underline text-sm mb-4 text-left"
                >
                  📈 View Price History
                </button>

                <div className="mt-auto flex gap-3">
                  <a
                    href={affiliateUrl}
                    target="_blank"
                    className="
                      flex-1 
                      text-center 
                      bg-blue-600 
                      text-white 
                      py-2 
                      rounded-lg 
                      hover:bg-blue-700 
                      transition
                    "
                  >
                    View
                  </a>

                  <button
                    onClick={() => handleDelete(item.id)}
                    className="
                      flex-1 
                      bg-gray-200 
                      text-gray-700 
                      py-2 
                      rounded-lg 
                      hover:bg-gray-300 
                      transition
                    "
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Price History Modal */}
      <Modal open={showChart} onClose={() => setShowChart(false)}>
        <h2 className="text-xl font-semibold mb-3">Price History</h2>

        <PriceHistoryChart snapshots={selectedProduct?.price_snapshots || []} />

        <p className="mt-4 text-gray-400 text-xs text-center">
          Chart updates automatically as PriceScan collects more data.
        </p>
      </Modal>
    </main>
  );
}
