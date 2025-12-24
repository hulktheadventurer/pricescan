"use client";

import { useEffect, useCallback, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ProductCard from "@/components/ProductCard";
import { toast } from "sonner";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  // Session
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

  // Load tracked products
  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("tracked_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Failed to load tracked products.");
      return;
    }

    setProducts(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!user) {
      setProducts([]);
      return;
    }

    loadProducts();

    const refresh = () => loadProducts();
    window.addEventListener("pricescan-products-refresh", refresh as any);
    return () =>
      window.removeEventListener("pricescan-products-refresh", refresh as any);
  }, [user, loadProducts]);

  async function handleTrack() {
    if (loading) return;

    const input = url.trim();
    if (!input) {
      toast.error("Paste a product URL first.");
      return;
    }

    if (!user) {
      toast.error("Please sign in to track products.");
      return;
    }

    if (isAliExpressUrl(input)) {
      toast.error(
        "AliExpress tracking is paused. Use the AliExpress button on cards for affiliate search."
      );
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to track product");

      setUrl("");
      toast.success("Product added.");
      await loadProducts();
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong.");
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
          onKeyDown={(e) => {
            if (e.key === "Enter") handleTrack();
          }}
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
        <p className="text-gray-500 text-center">
          No items yet — track something!
        </p>
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
