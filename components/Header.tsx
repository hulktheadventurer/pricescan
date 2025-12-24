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

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user || null;
      if (!mounted) return;

      setUser(u);

      // Load currency preference if user exists
      if (u) {
        const { data } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", u.id)
          .maybeSingle();

        if (!mounted) return;

        if (data?.currency && isSupportedCurrency(data.currency)) {
          setCurrency(data.currency as CurrencyCode);
          broadcastCurrency(data.currency as CurrencyCode);
        }
      }
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function broadcastCurrency(code: CurrencyCode) {
    window.dispatchEvent(
      new CustomEvent("pricescan-currency-update", { detail: code })
    );
  }

  async function persistCurrency(nextCurrency: CurrencyCode) {
    if (!user) return;
    await supabase.from("user_profile").upsert({
      user_id: user.id,
      currency: nextCurrency,
    });
  }

  async function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    broadcastCurrency(code);
    await persistCurrency(code);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  function triggerSignInModal() {
    window.dispatchEvent(new CustomEvent("pricescan-open-signin"));
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">
        <Link href="/" className="text-xl font-semibold flex items-center space-x-2">
          <span role="img">📈</span>
          <span>PriceScan</span>
        </Link>

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

          {/* Auth */}
          {user ? (
            <>
              <span className="text-gray-600 text-sm">{user.email}</span>
              <button onClick={signOut} className="text-red-600 text-sm hover:underline">
                Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={triggerSignInModal}
              className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
