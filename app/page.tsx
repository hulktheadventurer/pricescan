"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import ProductCard from "@/components/ProductCard";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

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

  const [url, setUrl] = useState("");
  const [tracking, setTracking] = useState(false);

  const [booting, setBooting] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);

  // ✅ Restore the old "email box" sign-in UX
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const userRef = useRef<any>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const redirectTo =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/finish`
      : `${
          typeof window !== "undefined" ? window.location.origin : ""
        }/auth/finish`;

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
          // ✅ Old behaviour: show email box, don’t redirect anywhere
          sessionStorage.setItem(PENDING_TRACK_KEY, input);
          toast.error("Please sign in to track products.");
          setShowSignIn(true);
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

    // ✅ If signed out: open email box (no /auth/signin page)
    if (!userRef.current) {
      sessionStorage.setItem(PENDING_TRACK_KEY, input);
      toast.error("Please sign in to track products.");
      setShowSignIn(true);
      return;
    }

    await trackUrl(input);
  }

  async function sendMagicLink() {
    const e = email.trim();
    if (!e) {
      toast.error("Enter your email first.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      toast.success("Magic link sent. Check your email.");
    } catch (err: any) {
      console.error("❌ signInWithOtp error:", err);
      toast.error(err?.message || "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

  // ✅ Restore boot/auth wiring so page knows signed-in state and stops skeletons
  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user ?? null;
        if (!alive) return;
        setUser(u);

        if (u) {
          await loadProductsViaApi({ silent: true });
          // Auto-track pending URL after refresh/login if it exists
          const pending = sessionStorage.getItem(PENDING_TRACK_KEY);
          if (pending) {
            sessionStorage.removeItem(PENDING_TRACK_KEY);
            await trackUrl(pending);
          }
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

      if (event === "SIGNED_IN" && u) {
        setShowSignIn(false);
        await loadProductsViaApi({ silent: true });

        const pending = sessionStorage.getItem(PENDING_TRACK_KEY);
        if (pending) {
          sessionStorage.removeItem(PENDING_TRACK_KEY);
          await trackUrl(pending);
        }
      }

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
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
      {/* HERO */}
      <div className="mb-8 sm:mb-10 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-4xl font-bold mb-3 sm:mb-4 leading-tight">
          Think before you buy.
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
          PriceScan shows real price history so you can tell whether today’s
          “deal” is actually cheap — or just marketing noise.
        </p>
      </div>

      {/* INPUT + LINK */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste an eBay product link…"
            className="h-12 w-full sm:flex-1 border rounded-lg px-4 bg-white text-gray-900 placeholder-gray-400"
          />
          <button
            onClick={handleTrack}
            disabled={tracking}
            className="h-12 w-full sm:w-auto bg-blue-600 text-white px-6 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {tracking ? "Tracking…" : "Track"}
          </button>
        </div>

        <div className="mt-2 text-sm text-gray-500 text-center sm:text-left">
          <a href="/ebay-price-tracker" className="hover:underline">
            Learn why PriceScan is different from eBay alerts →
          </a>
        </div>
      </div>

      {/* WHY */}
      <div className="bg-white border rounded-2xl p-5 sm:p-6 mb-10 sm:mb-12 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Why PriceScan?</h2>
        <ul className="text-gray-600 space-y-2 text-sm sm:text-base">
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
          Paste an eBay link and click <b>Track</b>.
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

      {/* SIGN IN MODAL (restored old "email box") */}
      {showSignIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white border shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-2">Sign in to continue</h3>
            <p className="text-gray-600 text-sm mb-4">
              Enter your email and we’ll send you a magic link.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 w-full sm:flex-1 border rounded-lg px-4 bg-white text-gray-900 placeholder-gray-400"
                autoComplete="email"
              />
              <button
                onClick={sendMagicLink}
                disabled={sending}
                className="h-12 w-full sm:w-auto bg-blue-600 text-white px-5 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send link"}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                onClick={() => setShowSignIn(false)}
                className="text-gray-600 hover:underline"
              >
                Cancel
              </button>
              <span className="text-gray-400">
                You’ll return automatically after signing in.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
