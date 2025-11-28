"use client";
import React, { useState } from "react";

export default function EbaySearchPage() {
  const [query, setQuery] = useState("");
  const [includeBroken, setIncludeBroken] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/ebay-search?q=${encodeURIComponent(query)}&includeBroken=${includeBroken}`
      );
      const data = await res.json();
      setResults(data.results || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">eBay Search</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-3">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Search product… (e.g. iPhone 12, Latitude 3420)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <label className="flex items-center gap-2 mb-4 text-sm">
        <input
          type="checkbox"
          checked={includeBroken}
          onChange={(e) => setIncludeBroken(e.target.checked)}
        />
        Include broken / for-parts listings
      </label>

      {!loading && results.length === 0 && <p className="text-sm text-gray-600">No results.</p>}

      <div className="grid grid-cols-1 gap-3">
        {results.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            className={`border rounded p-3 flex gap-4 hover:shadow ${
              item.isBroken ? "opacity-60" : ""
            }`}
          >
            {item.image && (
              <img src={item.image} alt={item.title} className="w-24 h-24 object-cover rounded" />
            )}
            <div className="min-w-0">
              <h2 className="font-medium text-base line-clamp-2">{item.title}</h2>
              <p className="text-gray-700">
                {item.price} {item.currency} • {item.condition}
              </p>
              <p className="text-xs text-gray-500">{item.category}</p>
              {item.isBroken && (
                <p className="text-sm text-red-600 font-semibold mt-1">⚠ Missing / for parts</p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
