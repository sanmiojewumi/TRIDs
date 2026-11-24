'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Logo } from './Logo';
import { useSession } from '@/lib/session';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(`/browse?q=${encodeURIComponent(String(data.get('q') || ''))}`);
  }
  function closeMenu() {
    setMenuOpen(false);
  }
  const staff = user?.roles.length;
  return (
    <div className="shell">
      <header className="top">
        <Link href="/" onClick={closeMenu}><Logo /></Link>
        <form className="search" onSubmit={search}>
          <input name="q" placeholder="Search jackets, phones, sneakers…" aria-label="Search listings" />
          <button type="submit">Search</button>
        </form>
        <button
          type="button"
          className="menu-btn"
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-icon" aria-hidden="true" />
          Menu
        </button>
        <nav id="site-menu" className="nav" data-open={menuOpen}>
          <Link href="/browse" data-active={pathname.startsWith('/browse')} onClick={closeMenu}>Browse</Link>
          <Link href="/cart" data-active={pathname.startsWith('/cart')} onClick={closeMenu}>Basket</Link>
          <Link href="/favourites" data-active={pathname.startsWith('/favourites')} onClick={closeMenu}>Favourites</Link>
          <Link href="/sell" data-active={pathname.startsWith('/sell')} onClick={closeMenu}>Sell</Link>
          <Link href="/messages" data-active={pathname.startsWith('/messages')} onClick={closeMenu}>Inbox</Link>
          {user ? <Link href="/orders" data-active={pathname.startsWith('/orders')} onClick={closeMenu}>Orders</Link> : null}
          {staff ? <Link href="/admin" data-active={pathname.startsWith('/admin')} onClick={closeMenu}>Admin</Link> : null}
          {user ? <Link href="/account" data-active={pathname === '/account'} onClick={closeMenu}>Account</Link> : <Link href="/login" data-active={pathname.startsWith('/login')} onClick={closeMenu}>Sign in</Link>}
          {user ? <Link href="/account/profile" data-active={pathname.startsWith('/account/profile')} onClick={closeMenu}>Profile</Link> : <Link href="/register" data-active={pathname.startsWith('/register')} onClick={closeMenu}>Create account</Link>}
          {user ? <Link href="/account/settings" data-active={pathname.startsWith('/account/settings')} onClick={closeMenu}>Settings</Link> : null}
          {user ? <button className="text-btn" onClick={() => logout().then(() => { closeMenu(); router.push('/'); })}>Sign out</button> : null}
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
