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

type Snapshot = {
  price: number | null;
  seen_at: string;
};

export default function PriceHistoryChart({
  snapshots = [],
}: {
  snapshots: Snapshot[];
}) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="text-gray-400 text-sm italic">No price history yet.</p>
      </div>
    );
  }

  // Sort ASC (oldest → newest)
  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.seen_at).getTime() - new Date(b.seen_at).getTime()
  );

  // Labels always exist
  const labels = sorted.map((s) =>
    new Date(s.seen_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    })
  );

  // IMPORTANT:
  // Chart.js supports `null` values → creates a visual gap
  const prices = sorted.map((s) =>
    typeof s.price === "number" ? s.price : null
  );

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
              label: "Price",
              data: prices,
              borderColor: "#2563eb",
              backgroundColor: "rgba(37,99,235,0.15)",
              pointRadius: 3,
              spanGaps: false, // ⛔ do NOT connect gaps
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
                label: (ctx) =>
                  ctx.raw == null
                    ? "No price"
                    : `Price: ${ctx.raw}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: false,
            },
          },
        }}
      />
    </div>
  );
}
