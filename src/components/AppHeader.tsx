'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

/** `wide` spans the full window, matching the full-bleed editor and document screens. */
export default function AppHeader({ appName, wide = false }: { appName: string; wide?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = [
    { href: '/', label: 'Documents', active: pathname === '/' || pathname.startsWith('/documents') },
    { href: '/templates', label: 'Templates', active: pathname.startsWith('/templates') },
  ];
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }
  return (
    <header className="bg-white border-b border-[var(--line)]">
      <div className={`${wide ? 'px-4' : 'max-w-6xl mx-auto px-4'} h-14 flex items-center gap-6`}>
        <Link href="/" className="font-bold text-[17px] tracking-tight">{appName}</Link>
        <nav className="flex gap-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${n.active ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button className="ml-auto text-sm text-gray-500 hover:text-gray-900" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
