// pages/admin/tracking.js

import { useEffect, useState } from 'react';

export default function TrackingAdminPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEntries = async () => {
      try {
        const res = await fetch('/api/tracking/all');
        const data = await res.json();
        setEntries(data);
      } catch (err) {
        console.error('❌ Failed to fetch tracking entries', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEntries();
  }, []);

  return (
    <div className="min-h-screen bg-white p-6">
      <h1 className="text-2xl font-bold mb-4">📋 Tracked Items</h1>
      {loading ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p>No entries yet.</p>
      ) : (
        <table className="min-w-full border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left border-b">URL</th>
              <th className="px-4 py-2 text-left border-b">Email</th>
              <th className="px-4 py-2 text-left border-b">Latest Price</th>
              <th className="px-4 py-2 text-left border-b">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-2 text-blue-600 underline max-w-xs overflow-hidden text-ellipsis">
                  <a href={entry.url} target="_blank" rel="noopener noreferrer">
                    {entry.url}
                  </a>
                </td>
                <td className="px-4 py-2">{entry.email}</td>
                <td className="px-4 py-2">{entry.latestPrice || '–'}</td>
                <td className="px-4 py-2">
                  {entry.lastChecked ? new Date(entry.lastChecked).toLocaleString() : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
