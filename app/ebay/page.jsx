"use client";
import { useState } from "react";

export default function EbayPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);

    try {
      const res = await fetch(`/api/ebay-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) setResults(data.results);
      else alert("Search failed: " + data.error);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">
        🔍 PriceScan Comparison
      </h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6 justify-center">
        <input
          type="text"
          className="border p-2 flex-grow rounded max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search eBay..."
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {results.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {results.map((item) => (
            <div
              key={item.itemId}
              className="border p-4 rounded-lg shadow-sm hover:shadow-md transition"
            >
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-700 hover:underline"
              >
                {item.title}
              </a>
              <p className="text-sm text-gray-600 mb-2">
                💰 {item.price} {item.currency}
              </p>

              <div className="mt-2 flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Target £"
                  min="0"
                  step="0.01"
                  className="border p-1 w-24 rounded text-sm"
                  onChange={(e) =>
                    (item.targetPrice = parseFloat(e.target.value))
                  }
                />
                <button
                  className="bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 py-1 rounded"
                  onClick={async () => {
                    await fetch("/api/track", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: item.title,
                        price: item.price,
                        currency: item.currency,
                        link: item.link,
                        targetPrice: item.targetPrice || null,
                      }),
                    });
                    alert("✅ Item added to tracking list!");
                  }}
                >
                  📈 Track
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
