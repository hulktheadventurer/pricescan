import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "PriceScan — Track Prices Instantly",
  description: "Track product prices across eBay and more.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="verify-admitad" content="0e8bbbb3bf" />

        {/* ✅ Mobile scaling */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* ✅ Force light mode (prevents Android auto dark mode) */}
        <meta name="color-scheme" content="light" />

        {/* ✅ REQUIRED for Bubblewrap / Android TWA */}
        <link rel="manifest" href="/manifest.json" />
      </head>

      <body className="min-h-screen flex flex-col font-sans bg-gray-50 text-gray-900">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}
