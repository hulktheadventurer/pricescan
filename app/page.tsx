"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";

/**
 * Fixes:
 * - No more "sent" lying: prints real Supabase error/status
 * - Prevents OTP spam + adds cooldown + shows countdown
 * - Avoids slow/hanging UI: shorter timeouts + less re-loading
 * - Keeps items stable on first paint (no wipe)
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
 * Supabase queries are PromiseLike.
 * Wrap into a real Promise and apply timeout.
 */
function withTimeout<T>(
  promiseLike: PromiseLike<T>,
  ms: number,
  label: string
): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
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

function safeSupabaseErrorMessage(err: any) {
  if (!err) return null;
  const msg = err?.message || err?.error_description || err?.error || null;
  const status = err?.status;
  return status ? `${msg} (status ${status})` : msg;
}

export default function HomePage() {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Auth is unknown until first getSession resolves
  const [authReady, setAuthReady] = useState(false);

  const [email, setEmail] = useState("");
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  const [inputUrl, setInputUrl] = useState("");
  const [currency, setCurrency] = useState("GBP");

  const [items, setItems] = useState<TrackedProduct[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [tracking, setTracking] = useState(false);

  // OTP cooldown
  const [otpCooldownUntil, setOtpCooldownUntil] = useState<number | null>(null);
  const [otpSending, setOtpSending] = useState(false);

  // Prevent double initial load
  const didInitialLoadRef = useRef(false);

  // ----- Auth boot + listener -----
  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const s = await withTimeout(
          supabase.auth.getSession(),
          8000,
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

      // only reload products after auth is ready to avoid first-paint chaos
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

  // ----- Load products once authReady -----
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

      if (!u) {
        setItems([]);
        return;
      }

      // IMPORTANT: limit snapshot payload to reduce slowness
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

      const { data, error } = await withTimeout(q, 12000, "load tracked_products");

      if (error) {
        console.error("❌ loadProducts error:", error);
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

  // ----- Magic link send -----
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

    // hard lock to prevent double clicks
    if (otpSending) return;

    setOtpSending(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://pricescan.ai";
      const redirectTo = `${origin}/auth/callback`;

      // Useful debug in console (doesn't leak secrets)
      console.log("[OTP] email:", trimmed);
      console.log("[OTP] redirectTo:", redirectTo);

      const res = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });

      // Print full response for debugging
      console.log("[OTP] response:", res);

      if (res.error) {
        const msg = safeSupabaseErrorMessage(res.error) || "Failed to send magic link";
        console.error("❌ signInWithOtp error:", res.error);

        // Rate limit / email throttling
        if ((res.error as any).status === 429) {
          const until = Date.now() + 5 * 60 * 1000; // 5 minutes
          setOtpCooldownUntil(until);
          toast.error("Supabase rate-limited OTP. Wait 5 minutes and try once.");
          return;
        }

        toast.error(msg);
        return;
      }

      // If no error, Supabase accepted the request.
      toast.success("Magic link requested. Check Inbox/Spam/Promotions.");
    } catch (e: any) {
      console.error("❌ sendMagicLink exception:", e);
      toast.error(e?.message || "Failed to send magic link");
    } finally {
      setOtpSending(false);
    }
  }

  // ----- Track flow -----
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
        body: JSON.stringify({ url, user_id: user.id }),
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
          <div className="text-sm text-gray-600">
            {user ? (
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Currency:</span>
            <select
              className="border rounded px-2 py-1"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
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
                {otpSending ? "Sending..." : otpCooldownText ? `Wait ${otpCooldownText}` : "Send link"}
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

        <div className="mt-10">
          {loadingItems ? (
            <div className="text-center text-gray-500">Loading...</div>
          ) : !authReady ? (
            <div className="text-center text-gray-500">Loading auth...</div>
          ) : !user ? (
            <div className="text-center text-gray-500">No items yet — track something!</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-500">No items yet — track something!</div>
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
                  <div key={item.id} className="border rounded-2xl p-5 bg-white shadow-sm">
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
                      {typeof price === "number" && curLabel ? formatMoney(curLabel, price) : "—"}
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

        <div className="mt-10 text-center text-xs text-gray-400">
          If magic link emails don’t arrive, check DevTools Console for the exact Supabase error/status.
        </div>
      </div>
    </div>
  );
}
