"use client";

import { metadata } from "./metadata";
export { metadata };

import "./globals.css";
import { Toaster, toast } from "sonner";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";


export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Signed out successfully!");
    setTimeout(() => window.location.reload(), 600);
  }

  async function handleSignIn() {
    const email = prompt("Enter your email to receive a magic link:");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) toast.error("Sign-in failed: " + error.message);
    else toast.success("Magic link sent! Check your inbox.");
  }

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col font-sans bg-gray-50 text-gray-900">

        {/* Header */}
        <header className="flex justify-between items-center px-6 py-3 border-b bg-white shadow-sm">
          <Link href="/" className="text-xl font-bold text-blue-600 flex items-center gap-1">
            💰 PriceScan
          </Link>

          <nav className="flex items-center gap-6 text-sm">
            {user ? (
              <>
                <span className="text-gray-500">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="text-red-500 hover:underline"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={handleSignIn}
                className="text-blue-500 hover:underline"
              >
                Sign In
              </button>
            )}
          </nav>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>

        {/* Footer */}
        <footer className="text-center py-4 text-sm text-gray-500 border-t">
          © {new Date().getFullYear()} PriceScan · All rights reserved ·{" "}
          <Link href="/terms" className="underline">Terms</Link> ·{" "}
          <Link href="/privacy" className="underline">Privacy</Link>
        </footer>

        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
