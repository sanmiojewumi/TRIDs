'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/account', label: 'Account' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/settings', label: 'Settings' },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <div className="chips" style={{ marginBottom: 8 }}>
      {links.map((link) => (
        <Link key={link.href} className="chip" href={link.href} data-active={pathname === link.href}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
