"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import PriceHistoryChart from "@/components/PriceHistoryChart";
import { isSupportedCurrency, CurrencyCode } from "@/lib/currency";

type Snapshot = {
  id?: string;
  price: number | null;
  currency: string | null;
  seen_at: string;
  ship_country?: string | null;
};

type TrackedProduct = {
  id: string;
  title: string | null;
  url: string | null;
  merchant: string | null;
  ship_country?: string | null;
};

export default function HistoryClient() {
  const supabase = createClientComponentClient();
  const params = useSearchParams();
  const router = useRouter();

  const productId = params?.get("product_id") || "";

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [product, setProduct] = useState<TrackedProduct | null>(null);

  const [shipCountry, setShipCountry] = useState<string>("GB");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currencyHint, setCurrencyHint] = useState<CurrencyCode>("GBP");

  // Load session + profile prefs
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      if (cancelled) return;

      setUserEmail(u?.user?.email || "");

      // Get user profile (ship + currency)
      if (u?.user?.id) {
        const { data: prof } = await supabase
          .from("user_profile")
          .select("ship_country, currency")
          .eq("user_id", u.user.id)
          .maybeSingle();

        if (!cancelled) {
          const sc = (prof?.ship_country || "GB").toUpperCase();
          setShipCountry(sc);

          const cur = String(prof?.currency || "GBP").toUpperCase();
          if (isSupportedCurrency(cur)) setCurrencyHint(cur as CurrencyCode);
        }
      }

      setLoading(false);
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Load product + snapshots (filtered by ship country)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!productId) return;

      setLoading(true);

      const { data: prod } = await supabase
        .from("tracked_products")
        .select("id,title,url,merchant,ship_country")
        .eq("id", productId)
        .maybeSingle();

      if (cancelled) return;
      setProduct((prod as any) || null);

      // ✅ filter snapshots by ship_country if column exists
      // If you have older rows without ship_country, you can show them only when shipCountry == "".
      const q = supabase
        .from("price_snapshots")
        .select("id,price,currency,seen_at,ship_country")
        .eq("product_id", productId)
        .order("seen_at", { ascending: true });

      const { data: snaps } = await q.eq("ship_country", shipCountry);

      if (!cancelled) {
        setSnapshots((snaps as any) || []);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, productId, shipCountry]);

  const hasSnapshots = snapshots.length > 0;

  const latest = useMemo(() => {
    if (!hasSnapshots) return null;
    return snapshots[snapshots.length - 1];
  }, [hasSnapshots, snapshots]);

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
        <div className="text-sm text-gray-500 mb-6">
          Signed in as: {userEmail}
        </div>
      )}

      {product && (
        <div className="bg-white border rounded-2xl p-5 shadow-sm mb-6">
          <div className="font-semibold text-lg mb-1">
            {product.title || "Untitled"}
          </div>
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

          <div className="mt-3 text-sm text-gray-600">
            Ship to: <span className="font-semibold">{shipCountry}</span>{" "}
            <span className="text-gray-400">(based on your profile)</span>
          </div>

          {latest?.seen_at && (
            <div className="mt-2 text-xs text-gray-400">
              Latest snapshot: {new Date(latest.seen_at).toLocaleString("en-GB")}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-2xl p-5 shadow-sm">
        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : (
          <>
            {!hasSnapshots ? (
              <div className="text-gray-400 italic">
                No price history yet for ship country <b>{shipCountry}</b>.
              </div>
            ) : (
              <>
                <PriceHistoryChart snapshots={snapshots} />

                <div className="mt-4 text-xs text-gray-500">
                  Showing snapshots for <b>{shipCountry}</b>. Currency values
                  are stored as returned by AliExpress/eBay (your display
                  currency conversion happens on the cards).
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
