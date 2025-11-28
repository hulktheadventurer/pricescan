export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
      <p className="text-sm text-gray-600 mb-4">
        PriceScan stores only the minimum data needed to provide the service.
      </p>
      <ul className="list-disc list-inside text-sm text-gray-600 space-y-2">
        <li>
          When you sign in, your email address is stored securely by our auth
          provider (Supabase).
        </li>
        <li>
          Tracked product URLs and price history are stored so we can show you
          price changes over time.
        </li>
        <li>
          We do not sell your personal data. Some outbound links may include
          affiliate tracking parameters.
        </li>
      </ul>
      <p className="text-xs text-gray-500 mt-6">
        This project is experimental and may change or be shut down in the
        future.
      </p>
    </main>
  );
}
