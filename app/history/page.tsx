"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import PriceHistoryChart from "@/components/PriceHistoryChart";

type Snapshot = {
  price: number;
  currency: string;
  seen_at: string;
};

export default function HistoryPage() {
  const supabase = createClientComponentClient();
  const params = useSearchParams();
  const router = useRouter();

  // ✅ Null-safe for TS (some Next typings mark params as nullable)
  const productId = params?.get("product_id") ?? null;

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string>("");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      if (!productId) {
        setError("Missing product_id");
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      const prod = await supabase
        .from("tracked_products")
        .select("title")
        .eq("id", productId)
        .limit(1)
        .single();

      const snaps = await supabase
        .from("price_snapshots")
        .select("price, currency, seen_at")
        .eq("product_id", productId)
        .order("seen_at", { ascending: true });

      if (cancelled) return;

      if (snaps.error) {
        setError(snaps.error.message);
        setTitle(prod.data?.title ?? "");
        setSnapshots([]);
        setLoading(false);
        return;
      }

      setTitle(prod.data?.title ?? "");
      setSnapshots((snaps.data as Snapshot[]) ?? []);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [productId, supabase]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back
        </button>

        <div className="text-sm text-gray-500">
          {productId ? `Product ID: ${productId}` : ""}
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-2">Price History</h1>
      {title ? <p className="text-gray-600 mb-6">{title}</p> : null}

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="bg-white border rounded-2xl p-5">
          <PriceHistoryChart snapshots={snapshots} />
        </div>
      )}
    </div>
  );
}
