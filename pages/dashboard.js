import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false); // 👈 Key change

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    const fetchUserEntries = async () => {
      try {
        const res = await fetch('/api/tracking/all');
        const data = await res.json();
        const userEmail = 'hulktheadventurer@gmail.com'; // TEMP: Hardcoded email
        const userEntries = data.filter(item => item.email === userEmail);
        setEntries(userEntries);
      } catch (err) {
        console.error('❌ Error loading entries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserEntries();
  }, [hasMounted]);

  if (!hasMounted) return null; // Prevent rendering during build

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">📋 My Tracked Items</h1>

      {loading ? (
        <p>Loading...</p>
      ) : entries.length === 0 ? (
        <p>You’re not tracking any items yet.</p>
      ) : (
        <table className="w-full border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2">Product URL</th>
              <th className="text-left p-2">Latest Price</th>
              <th className="text-left p-2">Last Checked</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i}>
                <td className="p-2">
                  <a href={entry.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    {entry.url.slice(0, 50)}...
                  </a>
                </td>
                <td className="p-2">{entry.latestPrice || '–'}</td>
                <td className="p-2">
                  {entry.lastChecked && !isNaN(new Date(entry.lastChecked))
                    ? new Date(entry.lastChecked).toLocaleString()
                    : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
