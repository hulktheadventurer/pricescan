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

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

type Snapshot = {
  seen_at: string;
  // we’ll plot converted numbers
  price_converted?: number | null;
};

export default function PriceHistoryChart({ snapshots = [] }: { snapshots: Snapshot[] }) {
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
    new Date(s.seen_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  );

  const prices = sorted.map((s) =>
    typeof s.price_converted === "number" ? s.price_converted : null
  );

  const hasAnyPrice = prices.some((p) => typeof p === "number");

  if (!hasAnyPrice) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center">
        <p className="text-gray-400 text-sm italic">No valid prices recorded yet.</p>
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
                label: (ctx) => (ctx.raw == null ? "No price" : `Price: ${ctx.raw}`),
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
