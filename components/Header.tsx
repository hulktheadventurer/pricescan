"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import {
  SUPPORTED_CURRENCIES,
  CurrencyCode,
  isSupportedCurrency,
} from "@/lib/currency";

function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("signout_timeout")), ms)
    ),
  ]);
}

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
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;
      if (!mounted) return;

      setUser(u);

      if (u) {
        const { data: prof } = await supabase
          .from("user_profile")
          .select("currency")
          .eq("user_id", u.id)
          .maybeSingle();

        if (!mounted) return;

        if (prof?.currency && isSupportedCurrency(prof.currency)) {
          const c = prof.currency as CurrencyCode;
          setCurrency(c);
          window.dispatchEvent(
            new CustomEvent("pricescan-currency-update", { detail: c })
          );
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

  async function persistCurrency(nextCurrency: CurrencyCode) {
    if (!user) return;
    await supabase.from("user_profile").upsert({
      user_id: user.id,
      currency: nextCurrency,
    });
  }

  async function handleCurrencyChange(code: CurrencyCode) {
    setCurrency(code);
    window.dispatchEvent(
      new CustomEvent("pricescan-currency-update", { detail: code })
    );
    await persistCurrency(code);
  }

  async function sendMagicLink() {
    const e = email.trim().toLowerCase();
    if (!e) return toast.error("Enter your email to sign in.");

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
      toast.error(err?.message || "Error sending magic link email");
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);

    // ✅ immediately clear UI + tell the app
    setUser(null);
    window.dispatchEvent(new CustomEvent("pricescan-signed-out"));
    window.dispatchEvent(new CustomEvent("pricescan-products-refresh"));

    // ✅ attempt remote signout but DON'T let it hang forever
    try {
      await withTimeout(supabase.auth.signOut(), 2500);
    } catch (e: any) {
      // ✅ fallback: force local signout (no network)
      try {
        // supabase-js supports scope in v2
        // @ts-ignore
        await supabase.auth.signOut({ scope: "local" });
      } catch {}
    } finally {
      toast.success("Signed out.");

      // ✅ HARD reset (no router/hydration weirdness)
      window.location.replace("/");
      // also refresh Next cache in case browser blocks replace for some reason
      router.refresh();
    }
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">
        <Link href="/" className="text-xl font-semibold flex items-center space-x-2">
          <span role="img">📈</span>
          <span>PriceScan</span>
        </Link>

        <div className="flex items-center space-x-4">
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

          {user ? (
            <>
              <span className="text-gray-600 text-sm">{user.email}</span>
              <button
                onClick={signOut}
                disabled={signingOut}
                className="text-red-600 text-sm hover:underline disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign Out"}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email to sign in"
                className="border rounded px-2 py-1 text-sm w-56"
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
