'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/guide', label: 'Guide' },
  { href: '/setup', label: 'Setup' },
  { href: '/meetings', label: 'Meetings' },
  { href: '/agents', label: 'Agents' },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 px-4 sm:px-6 py-3"
      style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Agent Council
        </Link>

        <div className="flex-1" />

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="sm:hidden text-sm px-2 py-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {open ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden mt-3 pb-1 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
