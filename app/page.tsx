"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ProductCard from "@/components/ProductCard";
import { toast } from "sonner";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

function isAmazonUrl(u: string) {
  return /amazon\./i.test(u);
}

function isEbayUrl(u: string) {
  return /(^|\.)ebay\./i.test(u) || /ebay\.[a-z.]+\/itm\//i.test(u);
}

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function reloadProducts() {
    if (!user) {
      setProducts([]);
      return;
    }

    const { data, error } = await supabase
      .from("tracked_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setProducts(data ?? []);
  }

  useEffect(() => {
    reloadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    const handler = () => reloadProducts();
    window.addEventListener("pricescan-products-refresh", handler as any);
    return () =>
      window.removeEventListener("pricescan-products-refresh", handler as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleTrack() {
    const input = url.trim();
    if (!input) {
      toast.error("Paste a product URL first.");
      return;
    }

    if (!user) {
      toast.error("Please sign in to track products.");
      return;
    }

    // ✅ MVP rule: only allow tracking where we can actually track price
    if (isAliExpressUrl(input)) {
      toast.error(
        "AliExpress tracking is paused. For now, paste an eBay link (AliExpress button is available on tracked items)."
      );
      return;
    }

    if (isAmazonUrl(input)) {
      toast.error(
        "Amazon tracking requires PA-API access. For now, paste an eBay link (Amazon button is available on tracked items)."
      );
      return;
    }

    if (!isEbayUrl(input)) {
      toast.error("For now, PriceScan only tracks eBay links.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to track product");

      setUrl("");
      toast.success("Product added.");
      await reloadProducts();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8" />

      <h1 className="text-3xl font-bold mb-6">
        🔎 PriceScan — Track Product Prices
      </h1>

      <div className="flex gap-3 mb-10">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay link…"
          className="flex-1 border rounded px-4 py-2"
        />
        <button
          onClick={handleTrack}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Tracking…" : "Track"}
        </button>
      </div>

      {products.length === 0 ? (
        <p className="text-gray-500 text-center">No items yet — track something!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
