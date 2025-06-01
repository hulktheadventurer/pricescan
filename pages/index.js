// pages/index.js
import { useState } from 'react';
import axios from 'axios';
import Head from 'next/head';
import Link from 'next/link';

export default function Home() {
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setShowWaitlist(false);
    setLoading(true);
    try {
      const res = await axios.post('/api/track', { email, url });
      setMessage(res.data.message || 'Item tracked!');
      setUrl('');
    } catch (err) {
      if (err.response?.status === 403) {
        setMessage("🚫 You're already tracking 5 items. Want more? Join the waitlist below!");
        setShowWaitlist(true);
      } else {
        setMessage('❌ Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
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
      setShowWaitlist(false);
      setWaitlistJoined(true);
    } catch {
      setMessage('❌ Failed to join waitlist. Try again later.');
    }
  };

  return (
    <>
      <Head>
        <title>PriceScan.ai</title>
      </Head>
      <main style={{
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        textAlign: 'center',
        padding: '2rem'
      }}>
        <img src="/logo.png" alt="PriceScan Logo" style={{ height: 120, marginBottom: '1rem' }} />
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Smarter Shopping Starts Here.</h1>
        <p style={{ fontSize: '1.1rem' }}>Track prices on your favorite items and get alerted when they drop — for free.</p>

        <form onSubmit={handleSubmit} style={{ marginTop: '1rem', maxWidth: '400px', width: '100%' }}>
          <input
            type="url"
            placeholder="Amazon product URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            style={{ padding: '0.6rem', width: '100%', marginBottom: '0.5rem', fontSize: '1rem' }}
          />
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '0.6rem', width: '100%', marginBottom: '0.5rem', fontSize: '1rem' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ padding: '0.6rem 1.2rem', width: '100%', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 4, fontSize: '1rem' }}>
            {loading ? 'Loading…' : 'Start Tracking'}
          </button>
        </form>

        {message && <p style={{ color: message.startsWith('❌') || message.startsWith('🚫') ? 'red' : 'green', marginTop: '1rem', fontSize: '1rem' }}>{message}</p>}

        {showWaitlist && !waitlistJoined && (
          <button onClick={handleWaitlist} style={{ marginTop: '1rem', padding: '0.5rem 1rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 4, fontSize: '1rem' }}>
            ✅ Join Pro Waitlist
          </button>
        )}

     {email && (!showWaitlist || waitlistJoined) && (
  <p style={{ marginTop: '2rem', fontSize: '1rem' }}>
    <Link href={`/dashboard?email=${encodeURIComponent(email)}`}>Go to My Dashboard</Link>
  </p>
)}



        <div style={{ marginTop: '2rem', textAlign: 'center', maxWidth: '500px', fontSize: '1rem' }}>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>🚀 Features</h3>
          <ul style={{ textAlign: 'left', paddingLeft: 0, listStyle: 'none' }}>
            <li>✅ Track prices on Amazon (and soon eBay, Etsy...)</li>
            <li>✅ Get instant email alerts when prices drop</li>
            <li>✅ Easy-to-use dashboard to manage your items</li>
            <li>✅ Join the waitlist to unlock Pro tier with more items</li>
          </ul>
        </div>
      </main>
    </>
  );
}
