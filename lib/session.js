// lib/session.js
import { serialize, parse } from 'cookie';

export function setSession(res, email) {
  const cookie = serialize('userEmail', email, {
    path: '/',
    httpOnly: false, // accessible from frontend JS
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  res.setHeader('Set-Cookie', cookie);
}

export function getSession(req) {
  const cookies = parse(req.headers.cookie || '');
  return cookies.userEmail || null;
}
