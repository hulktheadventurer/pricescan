"use client";

import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useState } from "react";

export default function Header() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
    };
    loadUser();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto flex justify-between items-center py-4 px-4">

        <Link href="/" className="text-xl font-semibold flex items-center space-x-2">
          <span role="img">📈</span>
          <span>PriceScan</span>
        </Link>

        {user && (
          <div className="flex items-center space-x-4 text-sm">
            <span className="text-gray-600">{user.email}</span>
            <button onClick={signOut} className="text-red-600 hover:underline">
              Sign Out
            </button>
          </div>
        )}

      </div>
    </header>
  );
}
