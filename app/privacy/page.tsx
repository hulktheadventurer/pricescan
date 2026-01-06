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

      {/* 🔽 ADDITION STARTS HERE */}
      <section id="data-deletion" className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Data Deletion Request</h2>

        <p className="text-sm text-gray-600">
          You may request deletion of your personal data at any time.
        </p>

        <p className="text-sm text-gray-600 mt-2">
          To request deletion of your data (including your email address and
          tracked products), please email:
        </p>

        <p className="text-sm font-medium mt-2">
          price.alert@gmail.com
        </p>

        <p className="text-sm text-gray-600 mt-2">
          Please contact us from the email address you used with PriceScan (or
          specify that address). We will verify and process deletion requests
          within <strong>30 days</strong>.
        </p>
      </section>
      {/* 🔼 ADDITION ENDS HERE */}

      <p className="text-xs text-gray-500 mt-8">
        This project is experimental and may change or be shut down in the
        future.
      </p>
    </main>
  );
}
