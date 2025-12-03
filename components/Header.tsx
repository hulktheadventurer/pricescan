// components/Header.tsx
"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo / brand */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🪙</span>
          <span className="text-lg font-semibold tracking-tight text-blue-600">
            PriceScan
          </span>
        </Link>

        {/* Simple links only – no Home / Track / Admin / Sign Out */}
        <nav className="flex items-center gap-4 text-sm text-gray-600">
          <Link href="/privacy" className="hover:text-blue-600">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-blue-600">
            Terms
          </Link>
        </nav>
      </div>
    </header>
  );
}
