export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>
      <p className="text-sm text-gray-600 mb-4">
        This is a simple hobby project for tracking product prices. By using
        PriceScan, you understand that prices and availability may change at
        any time and we cannot guarantee accuracy.
      </p>
      <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
        <li>PriceScan is provided “as is”, with no warranty of any kind.</li>
        <li>
          We may stop, change, or remove this service at any time without
          notice.
        </li>
        <li>
          External product links may contain affiliate tags. We may receive a
          commission if you purchase through those links.
        </li>
      </ul>
    </main>
  );
}
