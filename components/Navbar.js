// components/Navbar.js
import Link from 'next/link';

export default function Navbar() {
  return (
    <nav style={{
      background: '#333',
      padding: '1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
    }}>
      <Link href="/" legacyBehavior>
        <a style={{ color: 'white', textDecoration: 'none' }}>🏠 Home</a>
      </Link>
      <Link href="/dashboard" legacyBehavior>
        <a style={{ color: 'white', textDecoration: 'none' }}>📊 Dashboard</a>
      </Link>
      <Link href="/pro" legacyBehavior>
        <a style={{ color: 'white', textDecoration: 'none' }}>🚀 Pro Waitlist</a>
      </Link>
    </nav>
  );
}
