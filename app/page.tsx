"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import { getEbayAffiliateLink } from "@/lib/affiliates/ebay";
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

type ProductRow = {
  id: string;
  title: string | null;
  url: string;
  merchant: string | null;
  locale: string | null;
  sku: string | null;

  is_sold_out?: boolean | null;
  is_ended?: boolean | null;
  status_message?: string | null;

  price_snapshots: Snapshot[];
  latest_price: number | null;
  currency: string;
  seen_at: string | null;
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export default function HomePage() {
  const supabase = createClientComponentClient();

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);

  const [trackStatus, setTrackStatus] = useState<string>("");

  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        setSignedInEmail(data?.user?.email ?? null);
      } catch {
        setSignedInEmail(null);
      }
      await loadProducts();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN") {
        setSignedInEmail(session?.user?.email ?? null);
        await loadProducts();
      }
      if (event === "SIGNED_OUT") {
        setSignedInEmail(null);
        setProducts([]);
      }
    });
    return () => sub?.subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const next = ce.detail;
      if (next && isSupportedCurrency(next)) {
        setDisplayCurrency(next as CurrencyCode);
      }
    };
    window.addEventListener("pricescan-currency-update", handler as EventListener);
    return () =>
      window.removeEventListener("pricescan-currency-update", handler as EventListener);
  }, []);

  async function loadProducts() {
    setLoadingProducts(true);

    try {
      const { data: userData } = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "supabase.auth.getUser"
      );

      const user = userData?.user;
      if (!user) {
        setProducts([]);
        return;
      }

      const q = supabase
        .from("tracked_products")
        .select(
          `
          id,
          title,
          url,
          merchant,
          locale,
          sku,
          is_sold_out,
          is_ended,
          status_message,
          price_snapshots (
            price,
            currency,
            seen_at
          )
        `
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false });

      const { data, error } = await withTimeout(q, 12000, "supabase select tracked_products");

      if (error) {
        console.error("❌ loadProducts supabase error:", error);
        toast.error(`Failed to load items: ${error.message}`);
        setProducts([]);
        return;
      }

      const mapped: ProductRow[] = (data || []).map((item: any) => {
        const snaps: Snapshot[] = Array.isArray(item.price_snapshots)
          ? [...item.price_snapshots].sort(
              (a, b) => new Date(b.seen_at).getTime() - new Date(a.seen_at).getTime()
            )
          : [];

        const last = snaps[0] ?? null;

        return {
          id: item.id,
          title: item.title ?? null,
          url: item.url,
          merchant: item.merchant ?? null,
          locale: item.locale ?? null,
          sku: item.sku ?? null,

          is_sold_out: item.is_sold_out ?? null,
          is_ended: item.is_ended ?? null,
          status_message: item.status_message ?? null,

          price_snapshots: snaps,
          latest_price: last?.price ?? null,
          currency: last?.currency ?? "GBP",
          seen_at: last?.seen_at ?? null,
        };
      });

      setProducts(mapped);
    } catch (e: any) {
      console.error("❌ loadProducts exception:", e);
      toast.error(e?.message || "Failed to load items.");
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }

  async function sendMagicLink() {
    const e = email.trim();
    if (!e) return toast.error("Enter your email.");

    setAuthLoading(true);
    try {
      const base =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || window.location.origin;

      const emailRedirectTo = `${base}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo },
      });

      if (error) throw error;

      toast.success("Magic link sent. Check your email.");
      setTrackStatus("📩 Magic link sent — open it to sign in.");
      setAuthOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to send magic link.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function trackNow() {
    const link = url.trim();
    if (!link) {
      toast.error("Please paste a product link.");
      setTrackStatus("❌ Please paste a product link.");
      return;
    }

    setLoading(true);
    setTrackStatus("⏳ Sending…");

    try {
      const { data: userData } = await withTimeout(
        supabase.auth.getUser(),
        8000,
        "supabase.auth.getUser (track)"
      );
      const user = userData?.user;

      if (!user) {
        setLoading(false);
        setTrackStatus("❌ Not signed in.");
        setAuthOpen(true);
        return;
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 20000);

      let res: Response;
      try {
        res = await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link, user_id: user.id }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(t);
      }

      const json = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        throw new Error(json?.error || `Track failed (${res.status})`);
      }

      toast.success("✅ Product added!");
      setTrackStatus("✅ Product added!");
      setUrl("");
      await loadProducts();
    } catch (e: any) {
      console.error("❌ track error:", e);

      if (e?.name === "AbortError") {
        toast.error("Track timed out. (Server/API hanging)");
        setTrackStatus("❌ Timed out — server/API is hanging.");
      } else {
        toast.error(e?.message || "Track failed.");
        setTrackStatus(`❌ ${e?.message || "Track failed."}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item?")) return;

    const { error } = await supabase.from("tracked_products").delete().eq("id", id);
    if (error) return toast.error("Delete failed.");

    toast.success("Removed.");
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">
      <h1 className="text-3xl font-bold mb-2 text-blue-600">
        🔎 PriceScan — Track Product Prices
      </h1>

      <p className="text-xs text-gray-500 mb-6">
        {signedInEmail ? `Signed in as: ${signedInEmail}` : "Not signed in."}
      </p>

      <div className="flex flex-col md:flex-row gap-3 w-full max-w-xl mx-auto mb-3">
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste an eBay product link..."
          className="flex-1 p-3 border rounded-md shadow-sm"
        />

        <button
          type="button"
          onClick={trackNow}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Tracking..." : "Track"}
        </button>
      </div>

      {trackStatus ? (
        <p className="text-sm text-gray-500 mb-5">{trackStatus}</p>
      ) : (
        <div className="mb-5" />
      )}

      {loadingProducts ? (
        <p className="text-gray-400">Loading…</p>
      ) : products.length === 0 ? (
        <p className="text-gray-500">No items yet — track something!</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 text-left">
          {products.map((item) => {
            const affiliateUrl = getEbayAffiliateLink(item.url);
            const hasPrice = item.latest_price !== null;

            let displayPrice = item.latest_price ?? 0;
            let displayCode: string = item.currency || "GBP";

            if (
              hasPrice &&
              isSupportedCurrency(item.currency) &&
              item.currency !== displayCurrency
            ) {
              displayPrice = convertCurrency(
                item.latest_price as number,
                item.currency as CurrencyCode,
                displayCurrency
              );
              displayCode = displayCurrency;
            }

            const isSoldOut = !!item.is_sold_out;
            const isEnded = !!item.is_ended;

            return (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border p-6 flex flex-col">
                <div className="h-[52px] mb-2 overflow-hidden">
                  <p className="font-semibold text-[18px] line-clamp-2">
                    {item.title || "Untitled"}
                  </p>
                </div>

                {isSoldOut && (
                  <span className="inline-block mb-2 px-2 py-1 text-xs font-semibold bg-red-100 text-red-700 rounded">
                    SOLD OUT
                  </span>
                )}
                {isEnded && (
                  <span className="inline-block mb-2 px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-600 rounded">
                    LISTING ENDED
                  </span>
                )}
                {item.status_message && (
                  <p className="text-xs text-gray-500 mb-2">{item.status_message}</p>
                )}

                {hasPrice ? (
                  <p className="text-[26px] font-bold text-gray-900 mb-1">
                    {displayCode} {displayPrice.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-sm text-blue-500 animate-pulse">
                    No price yet (sold out/ended or pending)
                  </p>
                )}

                <button
                  onClick={() => {
                    setSelectedProduct(item);
                    setShowChart(true);
                  }}
                  className="text-blue-600 text-sm mb-4 hover:underline text-left"
                >
                  📈 View Price History
                </button>

                <div className="mt-auto flex gap-3">
                  <a
                    href={affiliateUrl}
                    target="_blank"
                    rel="noreferrer"
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

      <Modal open={authOpen} onClose={() => setAuthOpen(false)}>
        <h2 className="text-xl font-semibold mb-3">Sign in to track</h2>
        <p className="text-sm text-gray-600 mb-4">
          Enter your email and we’ll send you a magic sign-in link.
        </p>

        <div className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="p-3 border rounded-md shadow-sm"
          />

          <button
            onClick={sendMagicLink}
            disabled={authLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {authLoading ? "Sending..." : "Send magic link"}
          </button>

          <button
            onClick={() => setAuthOpen(false)}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </Modal>
    </main>
  );
}
