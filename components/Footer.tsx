'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-16 py-6 border-t text-center text-sm text-gray-500 bg-gray-50">
      <div className="flex flex-col md:flex-row justify-center items-center gap-3">
        <p>© 2025 PriceScan · All rights reserved</p>
        <div className="flex gap-4">
          <Link href="/terms" className="hover:text-blue-600">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-blue-600">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-blue-600">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  )
}
