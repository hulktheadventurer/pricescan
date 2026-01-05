import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Toaster } from "sonner";

export const metadata = {
  title: "PriceScan — Track Prices Instantly",
  description: "Track product prices across eBay and more.",
  icons: {
    icon: "/favicon.ico",          // ✅ uses public/favicon.ico
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png" // optional, only if you have it
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
      </head>

      <body className="min-h-screen flex flex-col font-sans bg-gray-50 text-gray-900">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
