"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import {
  SUPPORTED_CURRENCIES,
  CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency";

// ✅ Currency → default shipping country mapping
const DEFAULT_SHIP_COUNTRY_BY_CURRENCY: Record<CurrencyCode, string> = {
  GBP: "GB",
  EUR: "DE",
  USD: "US",
  CAD: "CA",
  AUD: "AU",
  BRL: "BR",
  MXN: "MX",
  PLN: "PL",
  CZK: "CZ",
  SEK: "SE",
  AED: "AE",
  SAR: "SA",
  ZAR: "ZA",
  TRY: "TR",
  THB: "TH",
};

// ✅ Keep this list small/clean for MVP; you can expand later
const SHIP_COUNTRIES: { code: string; name: string }[] = [
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "DE", name: "Germany (EU baseline)" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },

  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },

  { code: "HK", name: "Hong Kong" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" },
  { code: "TH", name: "Thailand" },

  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },

  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czechia" },
  { code: "SE", name: "Sweden" },
  { code: "TR", name: "Turkey" },
  { code: "ZA", name: "South Africa" },
];

export default function Header() {
  const supabase = createClientComponentClient();

  const [user, setUser] = useState<any>(null);

  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [shipCountry, setShipCountry] = useState<string>("GB");

  // If user manually changes ship-to once, we stop auto-overwriting it on currency changes
  const [shipCountryLocked, setShipCountryLocked] = useState(false);

  // sign-in UI state
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const shipCountryLabel = useMemo(() => {
    return SHIP_COUNTRIES.find((c) => c.code === shipCountry)?.name || shipCountry;
  }, [shipCountry]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData?.user || null;
      if (!mounted) return;

      setUser(u);

      if (u) {
        const { data } = await supabase
          .from("user_profile")
          .select("currency, ship_country")
          .eq("user_id", u.id)
          .maybeSingle();

        if (!mounted) return;

        // currency
        if (data?.currency && isSupportedCurrency(data.currency)) {
          setCurrency(data.currency as CurrencyCode);
        }

        // ship country
        if (data?.ship_country && typeof data.ship_country === "string") {
          setShipCountry(data.ship_country.toUpperCase());
          setShipCountryLocked(true); // user already has a preference saved
        } else {
          // if not saved, default from currency
          const fallback =
            DEFAULT_SHIP_COUNTRY_BY_CURRENCY[
              (data?.currency && isSupportedCurrency(data.currency)
                ? (data.currency as CurrencyCode)
                : "GBP") as CurrencyCode
            ] || "GB";
          setShipCountry(fallback);
        }
      } else {
        // not signed in: default ship country based on currency
        setShipCountry(DEFAULT_SHIP_COUNTRY_BY_CURRENCY[currency] || "GB");
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

  async function persistProfile(nextCurrency: CurrencyCode, nextShipCountry: string) {
    if (!user) return;
    await supabase.from("user_profile").upsert({
      user_id: user.id,
      currency: nextCurrency,
      ship_country: nextShipCountry,
    });
  }

  function broadcastCurrency(code: CurrencyCode) {
    window.dispatchEvent(
      new CustomEvent("pricescan-currency-update", { detail: code })
    );
  }

  function broadcastShipCountry(code: string) {
    window.dispatchEvent(
      new CustomEvent("pricescan-ship-country-update", {
        detail: code,
      })
    );
  }

  async function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);

    // If ship country not locked by user, auto-default ship-to based on currency
    let nextShip = shipCountry;
    if (!shipCountryLocked) {
      nextShip = DEFAULT_SHIP_COUNTRY_BY_CURRENCY[code] || "GB";
      setShipCountry(nextShip);
      broadcastShipCountry(nextShip);
    }

    broadcastCurrency(code);
    await persistProfile(code, nextShip);
  }

  async function handleShipCountryChange(code: string) {
    const next = (code || "GB").toUpperCase();
    setShipCountry(next);
    setShipCountryLocked(true); // user made an explicit choice
    broadcastShipCountry(next);

    // persist
    await persistProfile(currency, next);
    toast.success(`Ship to set: ${shipCountryLabel}`);
  }

  async function sendMagicLink() {
    const e = email.trim().toLowerCase();
    if (!e) return toast.error("Enter your email first.");

    setSending(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      toast.success("Magic link sent — check your email.");
      setEmail("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to send magic link.");
    } finally {
      setSending(false);
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

        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Ship-to Selector */}
          <div className="flex items-center space-x-2">
            <span className="text-gray-600 text-sm">Ship to:</span>
            <select
              className="border p-1 rounded-md text-sm"
              value={shipCountry}
              onChange={(e) => handleShipCountryChange(e.target.value)}
              title="Pricing baseline depends on shipping country"
            >
              {SHIP_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

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
            <div className="flex items-center gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email for magic link"
                className="border rounded px-2 py-1 text-sm w-52"
              />
              <button
                onClick={sendMagicLink}
                disabled={sending}
                className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-60"
              >
                {sending ? "Sending…" : "Sign in"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
