"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

/**
 * FIX IN THIS FILE:
 * ✅ Removed duplicate Currency selector UI (Header already has one)
 * ❌ NOTHING else removed or changed
 */

type PriceSnapshot = {
  id?: string;
  price: number;
  currency: string;
  seen_at: string;
};

type TrackedProduct = {
  id: string;
  user_id: string;
  url: string;
  title: string | null;
  merchant: string | null;
  locale: string | null;
  sku: string | null;

  is_sold_out?: boolean | null;
  is_ended?: boolean | null;
  status_message?: string | null;

  created_at?: string;
  price_snapshots?: PriceSnapshot[];
};

function clampUrl(s: string) {
  return (s || "").trim();
}

function withTimeout<T>(
  promiseLike: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => {
      reject(new Error(`Timeout: ${label} (${ms}ms)`));
    }, ms);
  });

  const realPromise = Promise.resolve().then(() => promiseLike as unknown as T);

  return Promise.race([realPromise, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}

function getDisplayPrice(item: TrackedProduct): { price?: number; currency?: string } {
  const snaps = item.price_snapshots;
  if (Array.isArray(snaps) && snaps.length > 0) {
    return { price: snaps[0].price, currency: snaps[0].currency };
  }
  return { price: undefined, currency: undefined };
}

function formatMoney(currency: string, value: number) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function normalizeCurrencyLabel(cur: string) {
  return (cur || "GBP").toUpperCase();
}

export default function HomePage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  const [inputUrl, setInputUrl] = useState("");
  const [currency] = useState("GBP"); // kept for price display fallback

  const [items, setItems] = useState<TrackedProduct[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [tracking, setTracking] = useState(false);

  const didInitialLoadRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const s = await withTimeout(
          supabase.auth.getSession(),
          12000,
          "supabase.auth.getSession"
        );
        if (!mounted) return;
        setSession(s.data.session);
        setUser(s.data.session?.user ?? null);
      } finally {
        if (mounted) setAuthReady(true);
      }
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (authReady) void loadProducts(newSession?.user ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    void loadProducts(user);
  }, [authReady]);

  async function loadProducts(u: User | null) {
    try {
      setLoadingItems(true);
      if (!u) {
        setItems([]);
        return;
      }

      const q = supabase
        .from("tracked_products")
        .select(
          `
          id,
          user_id,
          url,
          title,
          merchant,
          locale,
          sku,
          is_sold_out,
          is_ended,
          status_message,
          created_at,
          price_snapshots (
            id,
            price,
            currency,
            seen_at
          )
        `
        )
        .eq("user_id", u.id)
        .order("created_at", { ascending: false })
        .order("seen_at", { foreignTable: "price_snapshots", ascending: false });

      const { data, error } = await withTimeout(
        q,
        20000,
        "loadProducts"
      );

      if (error) {
        toast.error(error.message);
        return;
      }

      setItems((data as TrackedProduct[]) ?? []);
    } finally {
      setLoadingItems(false);
    }
  }

  async function trackNow() {
    const url = clampUrl(inputUrl);
    if (!url) return toast.error("Paste an eBay product link.");

    if (!authReady) return toast.error("Auth still loading.");
    if (!user) {
      setShowEmailPrompt(true);
      return;
    }

    setTracking(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_id: user.id }),
      });

      if (!res.ok) {
        toast.error("Track failed");
        return;
      }

      toast.success("Tracking added.");
      setInputUrl("");
      await loadProducts(user);
    } finally {
      setTracking(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
  }

  async function removeItem(productId: string) {
    if (!user) return;

    const { error } = await supabase
      .from("tracked_products")
      .delete()
      .eq("id", productId)
      .eq("user_id", user.id);

    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      setItems((p) => p.filter((i) => i.id !== productId));
    }
  }

  return (
    <div className="min-h-[calc(100vh-120px)]">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="text-sm text-gray-600">
            {!authReady ? (
              "Loading auth..."
            ) : user ? (
              <>
                Signed in as {user.email} ·{" "}
                <button onClick={signOut} className="text-red-600 underline">
                  Sign out
                </button>
              </>
            ) : (
              "Not signed in."
            )}
          </div>

          {/* currency selector REMOVED here */}
          <div />
        </div>

        <h1 className="text-3xl font-bold text-center mb-2">
          🔎 PriceScan — Track Product Prices
        </h1>

        <div className="mt-6 flex items-center justify-center gap-3">
          <input
            className="w-full max-w-xl border rounded px-4 py-3 text-lg"
            placeholder="Paste an eBay product link..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && trackNow()}
          />

          <button
            className="bg-blue-600 text-white px-6 py-3 rounded font-semibold"
            onClick={trackNow}
            disabled={tracking}
          >
            {tracking ? "Tracking..." : "Track"}
          </button>
        </div>

        <div className="mt-10">
          {loadingItems ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : !user || items.length === 0 ? (
            <div className="text-center text-gray-500">
              No items yet — track something!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.map((item) => {
                const { price, currency: cur } = getDisplayPrice(item);
                const curLabel = normalizeCurrencyLabel(cur || currency);

                return (
                  <div key={item.id} className="border rounded-2xl p-5 bg-white">
                    <div className="font-bold text-lg">
                      {item.title || "Unknown item"}
                    </div>

                    <div className="mt-3 text-2xl font-extrabold">
                      {price ? formatMoney(curLabel, price) : "—"}
                    </div>

                    <div className="mt-4 flex gap-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-blue-600 text-white py-2 rounded text-center"
                      >
                        View
                      </a>

                      <button
                        onClick={() => removeItem(item.id)}
                        className="flex-1 bg-gray-200 py-2 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
