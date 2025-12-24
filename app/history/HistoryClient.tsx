"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import PriceHistoryChart from "@/components/PriceHistoryChart";
import { convertCurrency, isSupportedCurrency, CurrencyCode } from "@/lib/currency";

type Snapshot = {
  id?: string;
  price: number | null;
  currency: string | null;
  seen_at: string;
};

type TrackedProduct = {
  id: string;
  title: string | null;
  url: string | null;
  merchant: string | null;
};

export default function HistoryClient() {
  const supabase = createClientComponentClient();
  const params = useSearchParams();
  const router = useRouter();

  const productId = params?.get("product_id") || "";

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [product, setProduct] = useState<TrackedProduct | null>(null);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");

  // listen to header currency changes
  useEffect(() => {
    const handler = (e: any) => {
      const code = String(e?.detail || "").toUpperCase();
      if (isSupportedCurrency(code)) setDisplayCurrency(code as CurrencyCode);
    };
    window.addEventListener("pricescan-currency-update", handler as any);
    return () => window.removeEventListener("pricescan-currency-update", handler as any);
  }, []);

  // Load session + profile currency (initial)
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;

      setUserEmail(u?.user?.email || "");

      if (u?.user?.id) {
        const { data: prof } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", u.user.id)
          .maybeSingle();

        const cur = String(prof?.currency || "GBP").toUpperCase();
        if (isSupportedCurrency(cur)) setDisplayCurrency(cur as CurrencyCode);
      }

      setLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Load product + snapshots
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!productId) return;

      setLoading(true);

      const { data: prod } = await supabase
        .from("tracked_products")
        .select("id,title,url,merchant")
        .eq("id", productId)
        .maybeSingle();

      if (cancelled) return;
      setProduct((prod as any) || null);

      const { data: snaps } = await supabase
        .from("price_snapshots")
        .select("id,price,currency,seen_at")
        .eq("product_id", productId)
        .order("seen_at", { ascending: true });

      if (!cancelled) {
        setSnapshots((snaps as any) || []);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, productId]);

  const hasSnapshots = snapshots.length > 0;

  const latest = useMemo(() => {
    if (!hasSnapshots) return null;
    return snapshots[snapshots.length - 1];
  }, [hasSnapshots, snapshots]);

  const convertedSnapshots = useMemo(() => {
    return snapshots.map((s) => {
      const rawCur = String(s.currency || "GBP").toUpperCase();
      const fromCur = isSupportedCurrency(rawCur) ? (rawCur as CurrencyCode) : "GBP";
      const price =
        typeof s.price === "number" ? convertCurrency(s.price, fromCur, displayCurrency) : null;
      return { ...s, price_converted: price };
    });
  }, [snapshots, displayCurrency]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <button
        onClick={() => router.back()}
        className="text-sm text-blue-600 hover:underline mb-6"
      >
        ← Back
      </button>

      <h1 className="text-2xl font-bold mb-2">Price History</h1>

      {userEmail && (
        <div className="text-sm text-gray-500 mb-6">Signed in as: {userEmail}</div>
      )}

      {product && (
        <div className="bg-white border rounded-2xl p-5 shadow-sm mb-6">
          <div className="font-semibold text-lg mb-1">{product.title || "Untitled"}</div>

          <div className="text-sm text-gray-500">
            Merchant: {product.merchant || "unknown"}
            {product.url ? (
              <>
                {" "}
                •{" "}
                <a
                  href={product.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Open listing
                </a>
              </>
            ) : null}
          </div>

          {latest?.seen_at && (
            <div className="mt-2 text-xs text-gray-400">
              Latest snapshot: {new Date(latest.seen_at).toLocaleString("en-GB")}
            </div>
          )}

          <div className="mt-2 text-xs text-gray-400">
            Chart currency: <b>{displayCurrency}</b>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : !hasSnapshots ? (
          <div className="text-gray-400 italic">No price history yet.</div>
        ) : (
          <>
            <PriceHistoryChart snapshots={convertedSnapshots as any} />
            <div className="mt-4 text-xs text-gray-500">
              Values are converted to <b>{displayCurrency}</b> for the chart so it matches the cards.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
