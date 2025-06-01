// pages/admin/waitlist.js
import { useEffect, useState } from 'react';
import axios from 'axios';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function WaitlistAdmin() {
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [filter, setFilter] = useState('');

  const router = useRouter();

  useEffect(() => {
    const storedAuth = sessionStorage.getItem('waitlistAdminAuthed');
    if (storedAuth === 'true') {
      setAuthenticated(true);
    }
  }, []);

  const handleAuth = (e) => {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      sessionStorage.setItem('waitlistAdminAuthed', 'true');
      setAuthenticated(true);
    } else {
      alert('Wrong password');
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    const fetchWaitlist = async () => {
      try {
        const res = await axios.get('/api/waitlist/export');
        setWaitlist(res.data);
      } catch (err) {
        console.error('Failed to fetch waitlist', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWaitlist();
  }, [authenticated]);

  const downloadCSV = () => {
    const header = 'Email,Joined At\n';
    const rows = waitlist.map(entry => `${entry.email},${new Date(entry.createdAt).toISOString()}`).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'waitlist.csv';
    a.click();
  };

  const deleteEntry = async (id) => {
    try {
      await axios.delete(`/api/waitlist/${id}`);
      setWaitlist(waitlist.filter(entry => entry._id !== id));
    } catch (err) {
      alert('Failed to delete entry');
    }
  };

  const filteredList = waitlist.filter(entry => entry.email.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <Head>
        <title>Admin - Waitlist</title>
      </Head>
      <main style={{ fontFamily: 'Arial, sans-serif', padding: '4rem', maxWidth: '1000px', margin: 'auto', fontSize: '1.2rem' }}>
        {!authenticated ? (
          <form onSubmit={handleAuth} style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem' }}>🔒 Enter Admin Password</h1>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: '1rem', width: '250px', marginBottom: '1.5rem', fontSize: '1.2rem' }}
            /><br />
            <button type="submit" style={{ padding: '0.75rem 1.5rem', fontSize: '1.1rem' }}>Unlock</button>
          </form>
        ) : (
          <>
            <h1 style={{ fontSize: '3rem', textAlign: 'center' }}>📬 Pro Waitlist Admin</h1>
            <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
              <button onClick={downloadCSV} style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}>📥 Export CSV</button>
              <input
                type="text"
                placeholder="Search email..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{ padding: '0.75rem', width: '250px', fontSize: '1rem' }}
              />
            </div>
            {loading ? (
              <p style={{ textAlign: 'center' }}>Loading...</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '1.1rem' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '2px solid #ccc', padding: '1rem' }}>Email</th>
                      <th style={{ borderBottom: '2px solid #ccc', padding: '1rem' }}>Joined</th>
                      <th style={{ borderBottom: '2px solid #ccc', padding: '1rem' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((entry, index) => (
                      <tr key={index}>
                        <td style={{ borderBottom: '1px solid #eee', padding: '1rem' }}>{entry.email}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '1rem' }}>{new Date(entry.createdAt).toLocaleString()}</td>
                        <td style={{ borderBottom: '1px solid #eee', padding: '1rem' }}>
                          <button onClick={() => deleteEntry(entry._id)} style={{ color: 'red' }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
