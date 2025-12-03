"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  // Load user + currency preference
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      const u = data?.user;
      setUser(u);

      if (u) {
        const { data: pref } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", u.id)
          .maybeSingle();

        if (pref?.currency && isSupportedCurrency(pref.currency)) {
          setCurrency(pref.currency);
        }
      }
    };

    load();
  }, []);

  // Save new currency + update UI instantly
  async function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);

    if (user) {
      await supabase
        .from("user_profile")
        .upsert({ user_id: user.id, currency: code });
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">

        {/* Logo */}
        <Link href="/" className="text-xl font-semibold flex items-center space-x-2">
          <span role="img">📈</span>
          <span>PriceScan</span>
        </Link>

        {/* Right section */}
        <nav className="flex items-center space-x-5 text-sm text-gray-700">

          {/* Currency Selector — SAME as homepage */}
          <div>
            <select
              className="border p-1 px-2 rounded-md shadow-sm bg-white"
              value={currency}
              onChange={(e) =>
                handleCurrencyChange(e.target.value as CurrencyCode)
              }
            >
              {[...SUPPORTED_CURRENCIES].sort().map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>


          {user && (
            <>
              <span className="text-gray-600">{user.email}</span>
              <button
                onClick={signOut}
                className="text-red-600 hover:underline"
              >
                Sign Out
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
