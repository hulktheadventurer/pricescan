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

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

export default function PriceHistoryChart({ snapshots = [] }: any) {
  const hasData = snapshots.length > 0;

  // ✅ FIX: Sort snapshots ASC by date so oldest → newest
  const sorted = [...snapshots].sort(
    (a: any, b: any) => new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
  );

  const labels = sorted.map((s: any) =>
    new Date(s.seen_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })
  );

  const prices = sorted.map((s: any) => s.price);

  return (
    <div className="w-full h-[300px] flex items-center justify-center">
      {!hasData ? (
        <p className="text-gray-400 text-sm italic">No price history yet.</p>
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                label: "Price",
                data: prices,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,0.2)",
                pointRadius: 3,
                fill: true,
                tension: 0.3,
              },
            ],
          }}
        />
      )}
    </div>
  );
}
