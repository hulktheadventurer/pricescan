"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // list view only needs latest snapshot
  latest_price: number | null;
  currency: string;
  seen_at: string | null;

  // chart will be loaded on demand
  price_snapshots?: Snapshot[];
};

function timeout<T>(ms: number, label: string) {
  return new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
  );
}

// Supabase PostgrestBuilder is a thenable -> normalize to real Promise
function exec<T>(builder: any): Promise<T> {
  return builder.then((r: T) => r);
}

export default function HomePage() {
  const supabase = createClientComponentClient();

  // Auth (stable)
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<any>(null);

  // UI
  const [url, setUrl] = useState("");
  const [tracking, setTracking] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [statusLine, setStatusLine] = useState("");

  // Currency
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  // Chart modal
  const [showChart, setShowChart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartSnapshots, setChartSnapshots] = useState<Snapshot[]>([]);

  // Auth modal
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);

  // prevent overlapping loads + retry storms
  const loadInFlight = useRef(false);
  const retryTimer = useRef<any>(null);

  const signedInText = useMemo(() => {
    if (!authChecked) return "Checking sign-in…";
    if (!user) return "Not signed in.";
    return `Signed in as: ${user.email}`;
  }, [authChecked, user]);

  // Currency event
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const next = ce.detail;
      if (next && isSupportedCurrency(next)) setDisplayCurrency(next as CurrencyCode);
    };
    window.addEventListener("pricescan-currency-update", handler as EventListener);
    return () =>
      window.removeEventListener("pricescan-currency-update", handler as EventListener);
  }, []);

  // Init auth once + subscribe changes
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          timeout<any>(15000, "supabase.auth.getSession"),
        ]);
        const u = data?.session?.user ?? null;
        setUser(u);
      } catch {
        setUser(null);
      } finally {
        setAuthChecked(true);
      }

      await loadProducts();
    };

    const sub = supabase.auth.onAuthStateChange(async (_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      setAuthChecked(true);
      await loadProducts();
    });

    init();

    return () => {
      sub.data.subscription.unsubscribe();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProducts() {
    if (loadInFlight.current) return;
    loadInFlight.current = true;

    setLoadingProducts(true);

    try {
      if (!user) {
        setProducts([]);
        return;
      }

      // ✅ SPEED: only fetch latest snapshot for list view (limit 1)
      const builder = supabase
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
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false })
        .limit(1, { foreignTable: "price_snapshots" });

      const res: any = await Promise.race([
        exec<any>(builder),
        timeout<any>(25000, "supabase select tracked_products"), // slightly longer
      ]);

      if (res?.error) throw res.error;

      const mapped: ProductRow[] = (res?.data || []).map((item: any) => {
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
          latest_price: last?.price ?? null,
          currency: last?.currency ?? "GBP",
          seen_at: last?.seen_at ?? null,
        };
      });

      setProducts(mapped);
    } catch (e: any) {
      const msg = String(e?.message || "");
      console.error("❌ loadProducts failed:", e);

      // ✅ CRITICAL FIX: do NOT wipe products on timeout
      if (msg.startsWith("Timeout: supabase select tracked_products")) {
        toast.message("Loading is slow — retrying…");
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => {
          loadProducts();
        }, 1500);
        return;
      }

      toast.error(e?.message || "Failed to load items.");
      // keep old products, don’t clear
    } finally {
      setLoadingProducts(false);
      loadInFlight.current = false;
    }
  }

  async function fetchHistory(productId: string) {
    setChartLoading(true);
    setChartSnapshots([]);

    try {
      const builder = supabase
        .from("price_snapshots")
        .select("price,currency,seen_at")
        .eq("product_id", productId)
        .order("seen_at", { ascending: true });

      const res: any = await Promise.race([
        exec<any>(builder),
        timeout<any>(20000, "supabase select price_snapshots"),
      ]);

      if (res?.error) throw res.error;

      setChartSnapshots(res?.data || []);
    } catch (e: any) {
      console.error("❌ fetchHistory failed:", e);
      toast.error(e?.message || "Failed to load price history.");
      setChartSnapshots([]);
    } finally {
      setChartLoading(false);
    }
  }

  async function sendMagicLink() {
    const e = email.trim();
    if (!e) return toast.error("Enter your email.");

    setAuthSending(true);
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
      setStatusLine("📩 Magic link sent — open it to sign in.");
      setAuthOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to send magic link.");
    } finally {
      setAuthSending(false);
    }
  }

  async function trackNow() {
    const link = url.trim();
    if (!link) {
      toast.error("Please paste a product link.");
      setStatusLine("❌ Please paste a product link.");
      return;
    }

    if (!user) {
      setAuthOpen(true);
      setStatusLine("❌ Not signed in.");
      return;
    }

    setTracking(true);
    setStatusLine("⏳ Sending…");

    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link, user_id: user.id }),
        signal: controller.signal,
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(json?.error || `Track failed (${res.status})`);

      toast.success("✅ Product added!");
      setStatusLine("✅ Product added!");
      setUrl("");

      await loadProducts();
    } catch (e: any) {
      console.error("❌ trackNow failed:", e);
      if (e?.name === "AbortError") {
        toast.error("Track timed out (API didn’t respond).");
        setStatusLine("❌ Timed out — API didn’t respond.");
      } else {
        toast.error(e?.message || "Track failed.");
        setStatusLine(`❌ ${e?.message || "Track failed."}`);
      }
    } finally {
      clearTimeout(kill);
      setTracking(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item?")) return;

    try {
      const builder = supabase.from("tracked_products").delete().eq("id", id);
      const res: any = await Promise.race([
        exec<any>(builder),
        timeout<any>(15000, "supabase delete tracked_products"),
      ]);
      if (res?.error) throw res.error;

      toast.success("Removed.");
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      console.error("❌ delete failed:", e);
      toast.error(e?.message || "Delete failed.");
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 text-center">
      <h1 className="text-3xl font-bold mb-2 text-blue-600">
        🔎 PriceScan — Track Product Prices
      </h1>

      <p className="text-xs text-gray-500 mb-6">{signedInText}</p>

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
          disabled={tracking}
          className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {tracking ? "Tracking..." : "Track"}
        </button>
      </div>

      {statusLine ? <p className="text-sm text-gray-500 mb-5">{statusLine}</p> : <div className="mb-5" />}

      {loadingProducts && products.length === 0 ? (
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
                  onClick={async () => {
                    setSelectedProduct(item);
                    setShowChart(true);
                    await fetchHistory(item.id);
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
        {chartLoading ? (
          <p className="text-gray-400">Loading chart…</p>
        ) : (
          <PriceHistoryChart snapshots={chartSnapshots} />
        )}
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
            disabled={authSending}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {authSending ? "Sending..." : "Send magic link"}
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
