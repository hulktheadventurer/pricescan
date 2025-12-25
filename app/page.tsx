"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import ProductCard from "@/components/ProductCard";
import { toast } from "sonner";

function isAliExpressUrl(u: string) {
  return /aliexpress\./i.test(u);
}

const PENDING_TRACK_KEY = "pricescan_pending_track_url";

export default function HomePage() {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [booting, setBooting] = useState(true);

  const userRef = useRef<any>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // ✅ Sign-in modal state
  const [showSignIn, setShowSignIn] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const redirectTo =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`;

  async function loadProducts(forUser: any) {
    if (!forUser?.id) {
      setProducts([]);
      return;
    }

    const { data, error } = await supabase
      .from("tracked_products")
      .select(
        "id,user_id,url,created_at,title,merchant,locale,is_sold_out,is_ended,status_message"
      )
      .eq("user_id", forUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ loadProducts error:", error);
      toast.error(`loadProducts: ${error.message}`);
      setProducts([]);
      return;
    }

    console.log("✅ loadProducts rows:", data?.length, data);
    setProducts(data ?? []);
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

      // reload products after tracking
      window.dispatchEvent(new CustomEvent("pricescan-products-refresh"));
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Session init + auth changes
  useEffect(() => {
    let mounted = true;

    async function init() {
      setBooting(true);

      // 1) getSession (fast)
      const { data: s1 } = await supabase.auth.getSession();
      if (!mounted) return;

      const u1 = s1.session?.user ?? null;
      setUser(u1);

      // 2) If session is still null, do a follow-up getUser() (sometimes cookie hydration lags)
      if (!u1) {
        const { data: u2 } = await supabase.auth.getUser();
        if (!mounted) return;
        const u = u2.user ?? null;
        setUser(u);
        if (u) await loadProducts(u);
      } else {
        await loadProducts(u1);
      }

      // pending auto-track
      const pending = sessionStorage.getItem(PENDING_TRACK_KEY) || "";
      if ((u1 || userRef.current) && pending) {
        sessionStorage.removeItem(PENDING_TRACK_KEY);
        await trackUrl(pending);
      }

      setBooting(false);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (u) {
        setShowSignIn(false);
        await loadProducts(u);

        const pending = sessionStorage.getItem(PENDING_TRACK_KEY) || "";
        if (pending) {
          sessionStorage.removeItem(PENDING_TRACK_KEY);
          await trackUrl(pending);
        }
      } else {
        setProducts([]);
      }
    });

    const refresh = async () => {
      await loadProducts(userRef.current);
    };

    window.addEventListener("pricescan-products-refresh", refresh as any);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("pricescan-products-refresh", refresh as any);
    };
  }, [supabase]);

  // header can open modal
  useEffect(() => {
    const open = () => setShowSignIn(true);
    window.addEventListener("pricescan-open-signin", open as any);
    return () => window.removeEventListener("pricescan-open-signin", open as any);
  }, []);

  // clear instantly when signed out
  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setProducts([]);
      setShowSignIn(false);
      sessionStorage.removeItem(PENDING_TRACK_KEY);
    };
    window.addEventListener("pricescan-signed-out", onSignedOut as any);
    return () =>
      window.removeEventListener("pricescan-signed-out", onSignedOut as any);
  }, []);

  async function sendMagicLink() {
    const e = email.trim().toLowerCase();
    if (!e) return toast.error("Enter your email.");

    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      toast.success("Magic link sent — check your email.");
      setEmail("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send magic link.");
    } finally {
      setSending(false);
    }
  }

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

  async function debugReload() {
    const u = userRef.current;
    console.log("🔧 debugReload user:", u);
    await loadProducts(u);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* SIGN IN MODAL */}
      {showSignIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSignIn(false)}
          />
          <div className="relative bg-white w-[92%] max-w-md rounded-2xl shadow-xl border p-6">
            <div className="text-xl font-semibold mb-2">Sign in to PriceScan</div>
            <div className="text-sm text-gray-600 mb-4">
              Enter your email and we’ll send you a magic link.
            </div>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email to sign in"
              className="w-full border rounded px-3 py-2 mb-3"
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={sendMagicLink}
                disabled={sending}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send magic link"}
              </button>
              <button
                onClick={() => setShowSignIn(false)}
                className="flex-1 bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>

            <div className="text-xs text-gray-500 mt-3">
              After clicking the link in your email, you’ll be signed in here.
            </div>
          </div>
        </div>
      )}

      <div className="mb-8" />

      <h1 className="text-3xl font-bold mb-6">
        🔎 PriceScan — Track Product Prices
      </h1>

      <div className="flex gap-3 mb-4">
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

      {/* ✅ DEBUG BUTTON (TEMP) */}
      <div className="flex justify-end mb-10">
        <button
          onClick={debugReload}
          className="text-xs text-gray-500 hover:underline"
        >
          Debug: Reload products
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
