'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login({ appName }: { appName: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      setError((await res.json().catch(() => ({}))).error || 'Sign-in failed.');
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <h1 className="text-xl font-bold mb-1">{appName}</h1>
        <p className="hint mb-6">Sign in to send documents for signature.</p>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" type="password" className="input mb-4" value={password}
          onChange={e => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        {error && <p className="error-box mb-4" role="alert">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
