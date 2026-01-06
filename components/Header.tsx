"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import {
  SUPPORTED_CURRENCIES,
  CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency";

export default function Header() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [currency, setCurrency] = useState<CurrencyCode>("GBP");
  const [signingOut, setSigningOut] = useState(false);

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

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
  }, [supabase]);

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

  async function sendMagicLink() {
    const e = email.trim().toLowerCase();
    if (!e) return toast.error("Enter your email to sign in.");

    setSending(true);
    try {
      const base =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");

      const redirectTo = `${base.replace(/\/$/, "")}/auth/finish`;

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) throw error;

      toast.success("Magic link sent — check your email.");
      setEmail("");
    } catch (err: any) {
      toast.error(err?.message || "Error sending magic link email");
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      const res = await fetch("/auth/signout", { method: "POST" });
      if (!res.ok) throw new Error("Sign out failed");

      window.dispatchEvent(new CustomEvent("pricescan-signed-out"));
      toast.success("Signed out.");

      router.refresh();
      window.location.assign("/");
    } catch (err: any) {
      console.error("Sign out failed:", err);
      toast.error(err?.message || "Sign out failed.");
      setSigningOut(false);
    }
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3">
        {/* Mobile: stack. Desktop: row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Image
              src="/logo.png"
              alt="PriceScan"
              width={40}
              height={40}
              priority
              className="rounded-sm"
            />
            <span className="text-lg sm:text-xl font-semibold truncate">
              PriceScan
            </span>
          </Link>

          {/* Controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {/* Currency */}
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-sm whitespace-nowrap">
                Currency:
              </span>
              <select
                className="h-10 border rounded-md text-sm px-2 bg-white text-gray-900"
                value={currency}
                onChange={(e) =>
                  handleCurrencyChange(e.target.value as CurrencyCode)
                }
              >
                {SUPPORTED_CURRENCIES.slice()
                  .sort()
                  .map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
              </select>
            </div>

            {user ? (
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                <span className="text-gray-600 text-sm truncate max-w-[180px] sm:max-w-[240px]">
                  {user.email}
                </span>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  className="text-red-600 text-sm hover:underline disabled:opacity-60 whitespace-nowrap"
                >
                  {signingOut ? "Signing out…" : "Sign Out"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email to sign in"
                  className="h-10 border rounded-md px-3 text-sm w-full sm:w-64 bg-white text-gray-900 placeholder-gray-400"
                  autoComplete="email"
                  inputMode="email"
                />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={sending}
                  className="h-10 bg-blue-600 text-white text-sm px-4 rounded-md hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
                >
                  {sending ? "Sending…" : "Sign in"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
