"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

/**
 * IMPORTANT:
 * - This file does NOT remove features.
 * - Fixes:
 *   1) Tracked items not loading unless you click Track (auth hydration race)
 *   2) Magic link "sent" lying when Supabase returns 429 (rate limit)
 *   3) Better loading states + no "wipe" of items on first paint
 *   4) Remove duplicate currency selector on the page (Header already has one)
 *   5) "Not signed in" only shows after authReady (no weird flash/placement)
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

/**
 * Supabase queries (PostgrestBuilder) are PromiseLike, not Promise.
 * Use PromiseLike to avoid TS errors on Vercel.
 */
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

  // Wrap PromiseLike into a real Promise
  const realPromise = Promise.resolve().then(() => promiseLike as unknown as T);

  return Promise.race([realPromise, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}

/** Extract a "nice" price for display */
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

  // Auth is "unknown" until we do first getSession() call.
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  const [inputUrl, setInputUrl] = useState("");

  // NOTE: Currency state kept because you use it as fallback label for display prices.
  // We REMOVE the duplicate currency dropdown UI on this page (Header already has one).
  const [currency, setCurrency] = useState("GBP");

  const [items, setItems] = useState<TrackedProduct[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [tracking, setTracking] = useState(false);

  // Rate limit cooldown (OTP 429)
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number | null>(null);
  const [otpSending, setOtpSending] = useState(false);

  // Avoid double-loading on mount
  const didInitialLoadRef = useRef(false);

  // -------- Auth boot + listener --------
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
      } catch (e: any) {
        console.error("❌ getSession failed:", e);
        toast.error(e?.message || "Failed to read session");
      } finally {
        if (mounted) setAuthReady(true);
      }
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // When auth changes (login/logout), reload items accordingly
      if (authReady) {
        void loadProducts(newSession?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // -------- Load items once authReady is true --------
  useEffect(() => {
    if (!authReady) return;
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;

    void loadProducts(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  async function loadProducts(u: User | null) {
    try {
      setLoadingItems(true);

      // If signed out, show empty list (but only AFTER authReady)
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
        "supabase select tracked_products"
      );

      if (error) {
        console.error("❌ loadProducts supabase error:", error);
        toast.error(`Load failed: ${error.message}`);
        return;
      }

      setItems((data as unknown as TrackedProduct[]) ?? []);
    } catch (e: any) {
      console.error("❌ loadProducts failed:", e);
      toast.error(e?.message || "Load failed");
    } finally {
      setLoadingItems(false);
    }
  }

  // -------- Magic link send (handle 429, no lying) --------
  async function sendMagicLink(targetEmail: string) {
    const now = Date.now();
    if (otpCooldownUntil && now < otpCooldownUntil) {
      const seconds = Math.ceil((otpCooldownUntil - now) / 1000);
      toast.error(`Too many attempts. Try again in ${seconds}s.`);
      return;
    }

    const trimmed = (targetEmail || "").trim();
    if (!trimmed) {
      toast.error("Enter your email.");
      return;
    }

    if (otpSending) return;
    setOtpSending(true);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : "https://pricescan.ai/auth/callback";

      const res = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });

      // Helpful debug (doesn't leak secrets)
      console.log("[OTP] redirectTo:", redirectTo);
      console.log("[OTP] response:", res);

      if (res.error) {
        console.error("❌ signInWithOtp error:", res.error);

        // 429 rate limit
        if ((res.error as any).status === 429) {
          // 5 minute cooldown
          const until = Date.now() + 5 * 60 * 1000;
          setOtpCooldownUntil(until);
          toast.error("Rate limited by Supabase. Wait 5 minutes and try once.");
          return;
        }

        toast.error(res.error.message || "Failed to send magic link");
        return;
      }

      // Only show success if no error
      toast.success("Magic link requested. Check Inbox/Spam/Promotions.");
    } catch (e: any) {
      console.error("❌ sendMagicLink exception:", e);
      toast.error(e?.message || "Failed to send magic link");
    } finally {
      setOtpSending(false);
    }
  }

  // -------- Track flow --------
  async function trackNow() {
    const url = clampUrl(inputUrl);
    if (!url) {
      toast.error("Paste an eBay product link.");
      return;
    }

    if (!authReady) {
      toast.error("Auth still loading. Try again in a second.");
      return;
    }

    if (!user) {
      setShowEmailPrompt(true);
      return;
    }

    setTracking(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          user_id: user.id,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = json?.error || `Track failed (${res.status})`;
        toast.error(msg);
        return;
      }

      toast.success("Tracking added.");
      setInputUrl("");

      await loadProducts(user);
    } catch (e: any) {
      console.error("❌ trackNow failed:", e);
      toast.error(e?.message || "Track failed");
    } finally {
      setTracking(false);
    }
  }

  async function signOut() {
    try {
      await supabase.auth.signOut();
      toast.success("Signed out.");
    } catch (e: any) {
      toast.error(e?.message || "Sign out failed");
    }
  }

  async function removeItem(productId: string) {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("tracked_products")
        .delete()
        .eq("id", productId)
        .eq("user_id", user.id);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Removed.");
      setItems((prev) => prev.filter((p) => p.id !== productId));
    } catch (e: any) {
      toast.error(e?.message || "Remove failed");
    }
  }

  // ---- UI helpers ----
  const otpCooldownText = useMemo(() => {
    if (!otpCooldownUntil) return null;
    const diff = otpCooldownUntil - Date.now();
    if (diff <= 0) return null;
    return `${Math.ceil(diff / 1000)}s`;
  }, [otpCooldownUntil]);

  return (
    <div className="min-h-[calc(100vh-120px)]">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 mb-8">
          {/* Only show auth text once authReady to avoid weird placement/flash */}
          <div className="text-sm text-gray-600">
            {!authReady ? (
              <span className="text-gray-500">Loading auth...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span>Signed in as: {user.email}</span>
                <button onClick={signOut} className="text-red-600 hover:underline">
                  Sign Out
                </button>
              </div>
            ) : (
              <span>Not signed in.</span>
            )}
          </div>

          {/* Removed duplicate currency dropdown from page (Header already has it). */}
          <div />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-2">
          🔎 PriceScan — Track Product Prices
        </h1>

        {/* Input row */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <input
            className="w-full max-w-xl border rounded px-4 py-3 text-lg"
            placeholder="Paste an eBay product link..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void trackNow();
            }}
          />

          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-semibold disabled:opacity-60"
            onClick={trackNow}
            disabled={tracking}
          >
            {tracking ? "Tracking..." : "Track"}
          </button>
        </div>

        {/* Email prompt */}
        {showEmailPrompt && !user && (
          <div className="max-w-xl mx-auto mt-4 border rounded p-4 bg-white">
            <div className="font-semibold mb-2">Sign in to track</div>
            <div className="text-sm text-gray-600 mb-3">
              Enter your email and we’ll send you a magic link.
            </div>

            <div className="flex gap-2">
              <input
                className="flex-1 border rounded px-3 py-2"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <button
                className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                onClick={() => void sendMagicLink(email)}
                disabled={!!otpCooldownText || otpSending}
                title={otpCooldownText ? `Wait ${otpCooldownText}` : undefined}
              >
                {otpSending
                  ? "Sending..."
                  : otpCooldownText
                  ? `Wait ${otpCooldownText}`
                  : "Send link"}
              </button>

              <button
                className="border px-4 py-2 rounded"
                onClick={() => setShowEmailPrompt(false)}
              >
                Cancel
              </button>
            </div>

            <div className="text-xs text-gray-500 mt-2">
              Link will redirect to <code>/auth/callback</code>.
              {otpCooldownText ? (
                <span className="ml-2 text-red-600">
                  (Rate-limited — wait {otpCooldownText})
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mt-10">
          {loadingItems ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : !authReady ? (
            <div className="text-center text-gray-500">Loading auth...</div>
          ) : !user ? (
            <div className="text-center text-gray-500">
              No items yet — track something!
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-500">
              No items yet — track something!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.map((item) => {
                const { price, currency: cur } = getDisplayPrice(item);
                const curLabel = normalizeCurrencyLabel(cur || currency);

                const isEnded = !!item.is_ended;
                const isSoldOut = !!item.is_sold_out;

                const badgeText =
                  item.status_message ||
                  (isEnded ? "Listing ended" : isSoldOut ? "Out of stock" : "");

                return (
                  <div
                    key={item.id}
                    className="border rounded-2xl p-5 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-bold text-lg leading-snug">
                        {item.title || "Unknown item"}
                      </div>

                      {(isEnded || isSoldOut) && (
                        <span className="text-xs font-semibold px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                          {badgeText}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 text-2xl font-extrabold">
                      {typeof price === "number" && curLabel
                        ? formatMoney(curLabel, price)
                        : "—"}
                    </div>

                    <div className="mt-2">
                      <a
                        href={`/history?product_id=${encodeURIComponent(item.id)}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        📉 View Price History
                      </a>
                    </div>

                    <div className="mt-4 flex gap-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded text-center font-semibold"
                      >
                        View
                      </a>

                      <button
                        onClick={() => void removeItem(item.id)}
                        className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 rounded text-center font-semibold"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-gray-500 break-all">
                      {item.merchant ? `Merchant: ${item.merchant}` : null}
                      {item.sku ? ` • SKU: ${item.sku}` : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer helper */}
        <div className="mt-10 text-center text-xs text-gray-400">
          If magic link emails don’t arrive and Network shows <b>429</b>, Supabase
          rate-limited your OTP requests — wait and try once.
        </div>
      </div>
    </div>
  );
}
