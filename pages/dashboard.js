// pages/dashboard.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import Link from 'next/link';

export default function Dashboard() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;

    const storedEmail = sessionStorage.getItem('email');
    const fromQuery = router.query.email;

    if (storedEmail) {
      setEmail(storedEmail);
    } else if (fromQuery) {
      setEmail(fromQuery);
      sessionStorage.setItem('email', fromQuery);
    }
  }, [router.isReady, router.query.email]);

  useEffect(() => {
    if (email) {
      fetchItems();
    }
  }, [email]);

  const fetchItems = async () => {
    try {
      const res = await axios.get(`/api/dashboard?email=${encodeURIComponent(email)}`);
      setItems(res.data);
    } catch {
      setMessage('❌ Failed to load your items');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/tracking/${id}`);
      fetchItems();
    } catch {
      alert('❌ Failed to delete item');
    }
  };

  const handleWaitlist = async () => {
    try {
      const res = await axios.post('/api/waitlist', { email });
      if (res.data.alreadyJoined) {
        setMessage('📬 You’ve already joined the waitlist. Thanks!');
      } else {
        setMessage('🎉 You’ve been added to the Pro waitlist!');
      }
      setWaitlistJoined(true);
    } catch {
      setMessage('❌ Failed to join waitlist. Try again later.');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('email');
    router.push('/');
  };

  if (!email) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>Please enter your email on the homepage first.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <strong>📧 Logged in as:</strong> {email}
        </div>
        <div>
          <button onClick={handleLogout} style={{ backgroundColor: '#ef4444', color: 'white', padding: '0.4rem 0.8rem', border: 'none', borderRadius: 4 }}>
            Logout
          </button>
        </div>
      </div>

      <h2>📦 Tracked Items</h2>
      <p>{items.length} out of 5 items tracked.</p>

      {items.map((item) => (
        <div key={item._id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', background: '#f9f9f9' }}>
          <p><strong>🔗 URL:</strong> <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></p>
          <p>💰 <strong>Price:</strong> {item.price || 'Not found'}</p>
          <p>📅 <strong>Last Checked:</strong> {item.lastChecked ? new Date(item.lastChecked).toLocaleString() : 'Never'}</p>
          <button onClick={() => handleDelete(item._id)} style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: 4 }}>
            ❌ Delete
          </button>
        </div>
      ))}

      {!waitlistJoined && (
        <div style={{ marginTop: '2rem' }}>
          <h3>🚀 Want more than 5 items?</h3>
          <p>Join the Pro waitlist and be the first to unlock extended tracking.</p>
          <button onClick={handleWaitlist} style={{ backgroundColor: '#10b981', color: 'white', padding: '0.5rem 1rem', border: 'none', borderRadius: 4 }}>
            ✅ Join Pro Waitlist
          </button>
        </div>
      )}

      {message && <p style={{ marginTop: '1rem', color: message.startsWith('❌') ? 'red' : 'green' }}>{message}</p>}
    </div>
  );
}
