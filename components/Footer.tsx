export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full text-center text-sm text-gray-600 py-6 mt-12 border-t">
      <div className="space-x-6">
        <a href="/privacy" className="hover:underline">
          Privacy
        </a>
        <a href="/terms" className="hover:underline">
          Terms
        </a>
      </div>

      <div className="mt-2 text-gray-400">
        © {year} PriceScan.ai
      </div>
    </footer>
  );
}
