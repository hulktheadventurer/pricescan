import { useState, useEffect } from 'react';

export default function DashboardPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;

    const fetchUserEntries = async () => {
      try {
        const res = await fetch('/api/tracking/all');
        const data = await res.json();

        console.log('📩 All Entries:', data);
        const emails = [...new Set(data.map(item => item.email))];
        console.log('📧 Emails Found:', emails);

        const userEmail = emails[0];
        const userEntries = data.filter(item => item.email === userEmail);
        console.log('🎯 Filtered Entries:', userEntries);

        setEntries(userEntries);
      } catch (err) {
        console.error('❌ Error loading entries:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchUserEntries();
  }, [hasMounted]);

  const deleteEntry = async (id) => {
    if (!id) {
      console.error('❌ Invalid ID passed to deleteEntry');
      return;
    }

    try {
      console.log('🗑️ Attempting to delete ID:', id);
      const res = await fetch(`/api/tracking/delete?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      console.log('🧼 Deleted:', data);
      setEntries(prev => prev.filter(e => e._id !== id));
    } catch (err) {
      console.error('❌ Error deleting:', err);
    }
  };

  if (!hasMounted) return null;

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
              <th className="text-left p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry._id}>
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
                <td className="p-2">
                  <button
                    className="text-red-600 hover:underline"
                    onClick={() => deleteEntry(entry._id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
