"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface ProductCardProps {
  userId?: string;
  product: {
    title: string;
    price: number;
    image?: string;
    amazon_url?: string;
    ebay_url?: string;
  };
}

export default function ProductCard({ userId, product }: ProductCardProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    if (!userId) {
      alert("⚠️ Please sign in to track products.");
      console.warn("No userId found, cannot track product.");
      return;
    }

    setLoading(true);
    console.log("🟢 Tracking product:", product.title);
    console.log("🧠 User ID:", userId);

    const { data, error } = await supabase.from("tracked_products").insert([
      {
        user_id: userId,
        product_name: product.title,
        amazon_url: product.amazon_url || null,
        ebay_url: product.ebay_url || null,
        current_price: product.price || 0,
        target_price: product.price || 0,
      },
    ]);

    if (error) {
      console.error("❌ Supabase insert error:", error);
      alert("Failed to save: " + error.message);
    } else {
      console.log("✅ Supabase insert success:", data);
      setIsTracking(true);
      alert("✅ Product is now being tracked!");
    }

    setLoading(false);
  };

  return (
    <div className="border border-gray-300 rounded-lg p-4 shadow-sm flex flex-col items-center text-center">
      {product.image && (
        <img
          src={product.image}
          alt={product.title}
          className="w-32 h-32 object-contain mb-3"
        />
      )}

      <h3 className="font-semibold text-sm mb-1">{product.title}</h3>
      <p className="text-blue-600 font-bold mb-2">£{product.price}</p>

      <div className="flex gap-2 mb-3">
        {product.amazon_url && (
          <a
            href={product.amazon_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-700 hover:underline"
          >
            Buy on Amazon
          </a>
        )}
        {product.ebay_url && (
          <a
            href={product.ebay_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-pink-600 hover:underline"
          >
            Buy on eBay
          </a>
        )}
      </div>

      <button
        onClick={handleTrack}
        disabled={loading || isTracking}
        className={`px-4 py-1 rounded text-white text-sm ${
          isTracking
            ? "bg-yellow-500 cursor-not-allowed"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        {loading
          ? "Saving..."
          : isTracking
          ? "Tracking 💾"
          : "Track 💾"}
      </button>
    </div>
  );
}
