'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent } from 'react';
import { Logo } from './Logo';
import { useSession } from '@/lib/session';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(`/browse?q=${encodeURIComponent(String(data.get('q') || ''))}`);
  }
  const staff = user?.roles.length;
  return (
    <div className="shell">
      <header className="top">
        <Link href="/"><Logo /></Link>
        <form className="search" onSubmit={search}>
          <input name="q" placeholder="Search jackets, phones, sneakers…" aria-label="Search listings" />
          <button type="submit">Search</button>
        </form>
        <nav className="nav">
          <Link href="/browse" data-active={pathname.startsWith('/browse')}>Browse</Link>
          <Link href="/cart" data-active={pathname.startsWith('/cart')}>Basket</Link>
          <Link href="/sell" data-active={pathname.startsWith('/sell')}>Sell</Link>
          <Link href="/messages">Inbox</Link>
          {staff ? <Link href="/admin">Admin</Link> : null}
          {user ? <Link href="/account">{user.displayName.split(' ')[0]}</Link> : <Link href="/login">Sign in</Link>}
          {user ? <button className="text-btn" onClick={() => logout().then(() => router.push('/'))}>Sign out</button> : null}
        </nav>
      </header>
      <main className="page">{children}</main>
      <footer className="footer">
        <span>Ninted 9ja · Preloved, properly.</span>
        <span><Link href="/policies/buyer-protection">Buyer protection</Link> · <Link href="/policies/returns">Returns</Link> · <Link href="/policies/privacy">Privacy</Link></span>
      </footer>
    </div>
  );
}
