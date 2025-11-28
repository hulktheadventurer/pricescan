"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function Header() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  // 🧠 Load user session
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // 🚪 Sign out
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
  };

  // ✉️ Sign in with email magic link
  const handleSignIn = async () => {
    const email = prompt("Enter your email to receive a magic link:");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert("Sign-in failed: " + error.message);
    else alert("Magic link sent! Check your inbox.");
  };

  return (
    <header className="flex justify-between items-center p-4 border-b bg-white shadow-sm">
      <Link href="/" className="text-xl font-bold text-blue-600 flex items-center">
        💰 PriceScan
      </Link>
      <nav className="flex gap-4 items-center">
        <Link href="/">Home</Link>
        <Link href="/track">Track</Link>
        <Link href="/admin">Admin</Link>
        {user ? (
          <>
            <span className="text-gray-700 text-sm">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              Sign Out
            </button>
          </>
        ) : (
          <button
            onClick={handleSignIn}
            className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            Sign In
          </button>
        )}
      </nav>
    </header>
  );
}
