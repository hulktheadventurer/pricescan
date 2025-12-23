"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ProductCard from "@/components/ProductCard";
import { toast } from "sonner";

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  // get current session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function loadProducts(u: any) {
    if (!u) {
      setProducts([]);
      return;
    }

    const { data, error } = await supabase
      .from("tracked_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setProducts(data ?? []);
  }

  // load tracked products
  useEffect(() => {
    loadProducts(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // refresh hook (for remove button)
  useEffect(() => {
    const handler = () => loadProducts(user);
    window.addEventListener("pricescan-products-refresh", handler);
    return () => window.removeEventListener("pricescan-products-refresh", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleTrack() {
    if (!url.trim()) {
      toast.error("Paste a product URL first.");
      return;
    }

    if (!user) {
      toast.error("Please sign in to track products.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to track product");
      }

      setUrl("");
      toast.success("Product added.");

      await loadProducts(user);
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6">
        🔎 PriceScan — Track Product Prices
      </h1>

      {/* Track box */}
      <div className="flex gap-3 mb-10">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link…"
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

      {/* Products */}
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
