"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import ProductCard from "@/components/ProductCard";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

const PENDING_TRACK_KEY = "pricescan_pending_track_url";

export default function HomePage() {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [lastLoadInfo, setLastLoadInfo] = useState<string>("");

  const userRef = useRef<any>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [showSignIn, setShowSignIn] = useState(false);

  async function loadProductsViaApi() {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.status === 401) {
        setProducts([]);
        setLastLoadInfo("not signed in");
        return;
      }
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "failed_products");
      setProducts(json.items ?? []);
      setLastLoadInfo(`loaded ${json.items?.length ?? 0} rows`);
    } catch (e: any) {
      console.error("❌ /api/products failed:", e);
      setProducts([]);
      setLastLoadInfo(`error: ${e?.message || "products_failed"}`);
      toast.error(e?.message || "Failed to load products");
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

    setLoading(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to track product");

      toast.success("Product added.");
      setUrl("");

      // reload after track
      await loadProductsViaApi();
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function runPendingTrackInBackground() {
    const pending = sessionStorage.getItem(PENDING_TRACK_KEY) || "";
    if (!pending) return;

    sessionStorage.removeItem(PENDING_TRACK_KEY);

    setTimeout(() => {
      if (!userRef.current) return;
      trackUrl(pending);
    }, 50);
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      setBooting(true);

      // load user (for UI only)
      const { data: s1 } = await supabase.auth.getSession();
      if (!mounted) return;
      const u1 = s1.session?.user ?? null;
      setUser(u1);

      if (!u1) {
        const { data: u2 } = await supabase.auth.getUser();
        if (!mounted) return;
        setUser(u2.user ?? null);
      }

      // ✅ load products via server API (reliable)
      await loadProductsViaApi();

      setBooting(false);

      // ✅ don’t block UI
      runPendingTrackInBackground();
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        setShowSignIn(false);
        await loadProductsViaApi();
        runPendingTrackInBackground();
      } else {
        setProducts([]);
        setLastLoadInfo("signed out");
        sessionStorage.removeItem(PENDING_TRACK_KEY);
        setBooting(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const open = () => setShowSignIn(true);
    window.addEventListener("pricescan-open-signin", open as any);
    return () => window.removeEventListener("pricescan-open-signin", open as any);
  }, []);

  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setProducts([]);
      setShowSignIn(false);
      sessionStorage.removeItem(PENDING_TRACK_KEY);
      setBooting(false);
    };
    window.addEventListener("pricescan-signed-out", onSignedOut as any);
    return () =>
      window.removeEventListener("pricescan-signed-out", onSignedOut as any);
  }, []);

  async function handleTrack() {
    const input = url.trim();
    if (!input) {
      toast.error("Paste a product URL first.");
      return;
    }

    if (!userRef.current) {
      sessionStorage.setItem(PENDING_TRACK_KEY, input);
      setShowSignIn(true);
      return;
    }

    await trackUrl(input);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* keep your existing modal if you want; leaving showSignIn unused here is fine */}

      <h1 className="text-3xl font-bold mb-2">
        🔎 PriceScan — Track Product Prices
      </h1>

      <div className="text-xs text-gray-500 mb-6">
        {user ? `user=${user.id}` : "user=null"} • products={products.length} •{" "}
        {lastLoadInfo}
      </div>

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

      {booting ? (
        <p className="text-gray-500 text-center">Loading…</p>
      ) : !user ? (
        <p className="text-gray-500 text-center">
          Paste an eBay link and click <b>Track</b>.
        </p>
      ) : products.length === 0 ? (
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
