'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'

interface Product {
  title: string
  price: string
  image: string
  link: string
  source: 'Amazon' | 'eBay'
}

export default function HomePage() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Product[]>([])
  const [tracked, setTracked] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)

  // --- Load tracked items from localStorage on startup ---
  useEffect(() => {
    const saved = localStorage.getItem('trackedProducts')
    if (saved) setTracked(JSON.parse(saved))
  }, [])

  // --- Save tracked items to localStorage when changed ---
  useEffect(() => {
    localStorage.setItem('trackedProducts', JSON.stringify(tracked))
  }, [tracked])

  const searchAll = async () => {
    if (!query) return
    setLoading(true)
    setItems([])

    try {
      const [amz, ebay] = await Promise.all([
        axios.get(`/api/amazon-search?q=${encodeURIComponent(query)}`),
        axios.get(`/api/ebay-search?q=${encodeURIComponent(query)}`)
      ])

      const amzItems =
        amz.data.ItemsResult?.Items?.map((x: any) => ({
          title: x.ItemInfo?.Title?.DisplayValue,
          price: x.Offers?.Listings?.[0]?.Price?.DisplayAmount,
          image: x.Images?.Primary?.Large?.URL,
          link: x.DetailPageURL,
          source: 'Amazon' as const
        })) || []

      const ebayItems =
        ebay.data.ItemsResult?.Items?.map((x: any) => ({
          title: x.ItemInfo?.Title?.DisplayValue,
          price: x.Offers?.Listings?.[0]?.Price?.DisplayAmount,
          image: x.Images?.Primary?.Large?.URL,
          link: x.DetailPageURL,
          source: 'eBay' as const
        })) || []

      const combined = [...amzItems, ...ebayItems].sort((a, b) =>
        parseFloat(a.price.replace(/[^0-9.]/g, '')) -
        parseFloat(b.price.replace(/[^0-9.]/g, ''))
      )

      setItems(combined)
    } catch {
      alert('Error fetching data')
    } finally {
      setLoading(false)
    }
  }

  const toggleTrack = (p: Product) => {
    const exists = tracked.find(t => t.link === p.link)
    if (exists) {
      setTracked(tracked.filter(t => t.link !== p.link))
    } else {
      setTracked([...tracked, p])
    }
  }

  const isTracked = (p: Product) => tracked.some(t => t.link === p.link)

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-center text-blue-700">
        PriceScan 🛒 Compare & Track Deals
      </h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="Search a product..."
          className="border p-2 flex-grow rounded shadow-sm focus:ring focus:ring-blue-200"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchAll()}
        />
        <button
          onClick={searchAll}
          className="bg-blue-600 text-white px-4 rounded hover:bg-blue-700 transition"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {loading && <p className="text-center text-gray-500">Loading results…</p>}

      {!loading && items.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((p, i) => (
            <div key={i} className="border rounded-lg p-4 shadow hover:shadow-lg transition">
              <img src={p.image} alt={p.title} className="w-32 h-auto mb-3 rounded" />
              <h2 className="font-semibold text-lg mb-1 text-gray-800">{p.title}</h2>
              <p className="text-green-700 font-medium mb-2">{p.price}</p>
              <div className="flex items-center gap-2">
                <a
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-sm font-medium ${
                    p.source === 'Amazon' ? 'text-blue-600' : 'text-orange-600'
                  } hover:underline`}
                >
                  Buy on {p.source}
                </a>
                <button
                  onClick={() => toggleTrack(p)}
                  className={`ml-auto px-2 py-1 text-sm rounded border ${
                    isTracked(p)
                      ? 'bg-yellow-300 border-yellow-500'
                      : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {isTracked(p) ? 'Tracking ✅' : 'Track 💾'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <p className="text-center text-gray-500">
          Search any product to compare Amazon and eBay.
        </p>
      )}

      {/* Tracked list */}
      {tracked.length > 0 && (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-2xl font-bold mb-4 text-center text-blue-600">
            Tracked Products ⭐
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {tracked.map((p, i) => (
              <div key={i} className="border rounded-lg p-4 shadow-sm">
                <img src={p.image} alt={p.title} className="w-24 h-auto mb-2 rounded" />
                <h3 className="font-semibold text-gray-800 mb-1">{p.title}</h3>
                <p className="text-green-700 font-medium mb-2">{p.price}</p>
                <div className="flex items-center gap-2">
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`text-sm ${
                      p.source === 'Amazon' ? 'text-blue-600' : 'text-orange-600'
                    } hover:underline`}
                  >
                    View on {p.source}
                  </a>
                  <button
                    onClick={() => toggleTrack(p)}
                    className="ml-auto text-sm text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
