"use client";

import { useSupabaseClient, useUser } from "@supabase/auth-helpers-react";
import Link from "next/link";

export default function Header() {
  const supabase = useSupabaseClient();
  const user = useUser();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">

        <Link href="/" className="text-xl font-semibold flex items-center space-x-2">
          <span role="img">💰</span>
          <span>PriceScan</span>
        </Link>

        <nav className="flex items-center space-x-6 text-sm text-gray-700">
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:underline">
            Terms
          </Link>

          {user && (
            <>
              <span className="text-gray-500">{user.email}</span>
              <button 
                onClick={signOut} 
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
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
