import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Image = dynamic(() => import('next/image'), { ssr: false });

export default function Home() {
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState(''); // 'success' | 'error' | 'limit'
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('⏳ Tracking your item...');
    setStatusType('');

    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, email }),
      });

      const data = await res.json();

      if (res.status === 403 && data.message?.includes('limit')) {
        setStatusType('limit');
        setStatus("🚫 You're already tracking 5 items. Want more? Upgrade to Pro (coming soon!)");
        return;
      }

      if (!res.ok) throw new Error(data.message || 'Failed to track');

      const countRes = await fetch(`/api/tracking/count?email=${encodeURIComponent(email)}`);
      const countData = await countRes.json();
      const trackedCount = typeof countData.count === 'number' ? countData.count : 1;

      setStatus(`🎉 You’re now tracking ${trackedCount} out of 5 items.`);
      setStatusType('success');
      setUrl('');
      setEmail('');
    } catch (err) {
      console.error('Tracking error:', err);
      setStatus('❌ Something went wrong. Please try again.');
      setStatusType('error');
    }
  };

  if (!hasMounted) return null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <img src="/logo.png" alt="Price Scan Logo" width="100" height="100" />

      <h1 className="text-2xl font-bold mt-6 mb-2">Smarter Shopping Starts Here.</h1>
      <p className="text-gray-600 mb-6">
        Track prices on your favorite items and get alerted when they drop — for free.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <input
          type="url"
          placeholder="Product URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="email"
          placeholder="Your Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white font-medium py-2 rounded hover:bg-blue-700"
        >
          Start Tracking
        </button>
      </form>

      {status && (
        <div className={`mt-4 text-sm ${statusType === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          <p>{status}</p>
          {statusType === 'success' && (
            <a href="/dashboard" className="inline-block mt-2 text-blue-600 hover:underline">
              → View your tracked items
            </a>
          )}
        </div>
      )}

      <a
        href="/dashboard"
        className="mt-8 inline-block text-blue-600 hover:underline text-sm"
      >
        Go to My Dashboard
      </a>

      <div className="mt-16 w-full max-w-3xl text-center">
        <h2 className="text-xl font-semibold mb-4">🚀 Features</h2>
        <ul className="space-y-3 text-gray-700">
          <li>✅ Track prices on Amazon (and soon eBay, Etsy...)</li>
          <li>✅ Get instant email alerts when prices drop</li>
          <li>✅ Easy-to-use dashboard to manage your items</li>
        </ul>
      </div>
    </div>
  );
}
