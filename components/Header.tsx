"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { SUPPORTED_CURRENCIES, CurrencyCode } from "@/lib/currency";

type SupabaseUser = {
  id: string;
  email?: string;
} | null;

export default function Header() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<SupabaseUser>(null);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>("GBP");
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Load current user + their currency preference
  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data, error } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (!error && data?.currency) {
          setDisplayCurrency(data.currency as CurrencyCode);
        }
      }

      setLoadingProfile(false);
    };

    load();
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function handleCurrencyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCurrency = e.target.value as CurrencyCode;
    setDisplayCurrency(newCurrency);

    if (!user) return;

    const { error } = await supabase.from("user_profile").upsert(
      {
        user_id: user.id,
        currency: newCurrency,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("Failed to update currency preference:", error);
    }
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">
        {/* Logo */}
        <Link
          href="/"
          className="text-xl font-semibold flex items-center space-x-2"
        >
          <span role="img" aria-label="chart">
            📈
          </span>
          <span>PriceScan</span>
        </Link>

        {/* Right side */}
        <nav className="flex items-center space-x-6 text-sm text-gray-700">
          {/* Currency selector */}
          {!loadingProfile && (
            <div className="flex items-center space-x-2">
              <span className="text-gray-500 hidden sm:inline">Currency:</span>
              <select
                value={displayCurrency}
                onChange={handleCurrencyChange}
                className="border rounded-md px-2 py-1 text-sm bg-white"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Legal links */}
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>

          {/* User info */}
          {user && (
            <>
              <span className="text-gray-600 hidden sm:inline">
                {user.email}
              </span>
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
