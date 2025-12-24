"use client";

import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

import {
  CurrencyCode,
  convertCurrency,
  isSupportedCurrency,
} from "@/lib/currency";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

type Snapshot = {
  price: number | null;
  currency: string | null;
  seen_at: string;
};

function fmt(amount: number, currency: CurrencyCode) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function PriceHistoryChart({
  snapshots = [],
  displayCurrency,
}: {
  snapshots: Snapshot[];
  displayCurrency: CurrencyCode;
}) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="text-gray-400 text-sm italic">No price history yet.</p>
      </div>
    );
  }

  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
  );

  const labels = sorted.map((s) =>
    new Date(s.seen_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })
  );

  // Convert each point using same rules as ProductCard
  const prices = sorted.map((s) => {
    if (typeof s.price !== "number") return null;

    const rawCur = String(s.currency || "GBP").toUpperCase();
    const fromCur = isSupportedCurrency(rawCur)
      ? (rawCur as CurrencyCode)
      : "GBP";

    const converted = convertCurrency(s.price, fromCur, displayCurrency);

    // IMPORTANT: match card rounding behaviour (2dp)
    return Math.round(converted * 100) / 100;
  });

  const hasAnyPrice = prices.some((p) => typeof p === "number");

  if (!hasAnyPrice) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="text-gray-400 text-sm italic">
          No valid prices recorded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px]">
      <Line
        data={{
          labels,
          datasets: [
            {
              label: `Price (${displayCurrency})`,
              data: prices,
              pointRadius: 3,
              spanGaps: false,
              tension: 0.3,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.raw as any;
                  if (v == null) return "No price";
                  return fmt(Number(v), displayCurrency);
                },
              },
            },
          },
          scales: {
            y: { beginAtZero: false },
          },
        }}
      />
    </div>
  );
}
