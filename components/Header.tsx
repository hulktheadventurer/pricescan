"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import {
  SUPPORTED_CURRENCIES,
  CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency";

export default function Header() {
  const supabase = createClientComponentClient();

  const [user, setUser] = useState<any>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");

  // Load user + currency from DB
  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user || null;
      setUser(u);

      if (u) {
        const { data } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", u.id)
          .maybeSingle();

        if (data?.currency && isSupportedCurrency(data.currency)) {
          setCurrency(data.currency as CurrencyCode);
        }
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);

    if (!user) return;

    // Save to DB
    await supabase
      .from("user_profile")
      .upsert({ user_id: user.id, currency: code });

    // Broadcast to the rest of the app
    window.dispatchEvent(
      new CustomEvent("pricescan-currency-update", {
        detail: code,
      })
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">

        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-semibold flex items-center space-x-2"
        >
          <span role="img">📈</span>
          <span>PriceScan</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center space-x-4">

          {/* Currency Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-gray-600 text-sm">Currency:</span>

            <select
              className="border p-1 rounded-md text-sm"
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value as CurrencyCode)}
            >
              {SUPPORTED_CURRENCIES.slice().sort().map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* User */}
          {user && (
            <>
              <span className="text-gray-600 text-sm">{user.email}</span>
              <button
                onClick={signOut}
                className="text-red-600 text-sm hover:underline"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
