"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import ProductCard from "@/components/ProductCard";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

// When user clicks Track while signed-out, store the URL here.
// After they sign in, we auto-track it.
const PENDING_TRACK_KEY = "pricescan_pending_track_url";

function SkeletonCard() {
  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm">
      <div className="h-5 w-3/4 bg-gray-200 rounded mb-4 animate-pulse" />
      <div className="h-8 w-1/3 bg-gray-200 rounded mb-2 animate-pulse" />
      <div className="h-3 w-1/2 bg-gray-200 rounded mb-6 animate-pulse" />
      <div className="h-10 w-full bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

export default function HomePage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const router = useRouter();

  const [url, setUrl] = useState("");
  const [tracking, setTracking] = useState(false);

  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  // Keep a ref so async handlers always read the latest user value
  const userRef = useRef<any>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  async function loadProductsViaApi({ silent }: { silent?: boolean } = {}) {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.status === 401) {
        setProducts([]);
        return;
      }
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "failed_products");
      setProducts(json.items ?? []);
    } catch (e: any) {
      console.error("❌ /api/products failed:", e);
      setProducts([]);
      toast.error(e?.message || "Failed to load products");
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  async function trackUrl(input: string) {
    if (!input) return;

    if (isAliExpressUrl(input)) {
      toast.error(
        "AliExpress tracking is paused. Use the AliExpress button on cards for affiliate search."
      );
      return;
    }

    setTracking(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          toast.error("Please sign in to track products.");
          // Save and redirect to signin
          sessionStorage.setItem(PENDING_TRACK_KEY, input);
          router.push("/auth/signin");
          return;
        }
        throw new Error(json?.error || "Failed to track product");
      }

      toast.success("Product added.");
      setUrl("");
      await loadProductsViaApi();
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong.");
    } finally {
      setTracking(false);
    }
  }

  async function handleTrack() {
    const input = url.trim();
    if (!input) {
      toast.error("Paste a product URL first.");
      return;
    }

    // If signed out, save and send them to the sign-in page
    if (!userRef.current) {
      toast.error("Please sign in to track products.");
      sessionStorage.setItem(PENDING_TRACK_KEY, input);
      router.push("/auth/signin");
      return;
    }

    await trackUrl(input);
  }

  // ✅ Boot session + load products
  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user ?? null;
        if (!alive) return;

        setUser(u);

        // If logged in, load products
        if (u) {
          await loadProductsViaApi({ silent: true });
        }
      } catch (e) {
        console.error("❌ boot session failed:", e);
      } finally {
        if (alive) setBooting(false);
      }
    }

    boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      // After sign-in, load products and auto-track pending URL (if any)
      if (event === "SIGNED_IN" && u) {
        await loadProductsViaApi({ silent: true });

        const pending =
          typeof window !== "undefined"
            ? sessionStorage.getItem(PENDING_TRACK_KEY)
            : null;

        if (pending) {
          sessionStorage.removeItem(PENDING_TRACK_KEY);
          // Track the pending URL
          await trackUrl(pending);
          // Return to homepage if user was on /auth/signin
          router.push("/");
        }
      }

      // After sign out, clear products
      if (event === "SIGNED_OUT") {
        setProducts([]);
      }
    });

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* HERO */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-4">
          Think before you buy.
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          PriceScan shows real price history so you can tell whether today’s
          “deal” is actually cheap — or just marketing noise.
        </p>
      </div>

      {/* INPUT + LINK */}
      <div className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste an eBay product link…"
            className="flex-1 border rounded px-4 py-2"
          />
          <button
            onClick={handleTrack}
            disabled={tracking}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {tracking ? "Tracking…" : "Track"}
          </button>
        </div>

        <div className="mt-2 text-sm text-gray-500">
          <a href="/ebay-price-tracker" className="hover:underline">
            Learn why PriceScan is different from eBay alerts →
          </a>
        </div>
      </div>

      {/* WHY */}
      <div className="bg-gray-50 border rounded-2xl p-6 mb-12">
        <h2 className="text-lg font-semibold mb-3">Why PriceScan?</h2>
        <ul className="text-gray-600 space-y-2 text-sm">
          <li>• See historical prices, not just today’s number</li>
          <li>• Avoid impulse buys caused by fake discounts</li>
          <li>• Get alerts only for meaningful price drops</li>
        </ul>
      </div>

      {/* CONTENT */}
      {booting ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !user ? (
        <p className="text-gray-500 text-center">
          Paste an eBay link and click <b>Track</b>. We’ll ask you to sign in.
        </p>
      ) : refreshing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : products.length === 0 ? (
        <p className="text-gray-500 text-center">
          No items yet — track something you’re thinking of buying.
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
