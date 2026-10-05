'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export type ItemMenu = { href: string; label: string };

/** Penanda tautan aktif: '/' hanya cocok untuk halaman persis root. */
function aktifSekarang(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavMenu({ menu }: { menu: ItemMenu[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {menu.map((m) => {
        const aktif = aktifSekarang(pathname, m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              aktif ? 'bg-white/15 font-semibold text-white' : 'text-white/75 hover:bg-white/10'
            }`}
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MenuMobile({ menu }: { menu: ItemMenu[] }) {
  const pathname = usePathname();
  const [terbuka, setTerbuka] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        aria-label="Menu"
        aria-expanded={terbuka}
        className="rounded-md border border-white/25 p-2 text-white/90"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M3 5h14v2H3V5zm0 4h14v2H3V9zm0 4h14v2H3v-2z" />
        </svg>
      </button>

      {terbuka && (
        <div className="absolute left-0 right-0 top-16 z-50 border-t border-white/10 bg-biru-800 px-4 py-3 animasi-naik">
          <nav className="flex flex-col gap-1">
            {menu.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setTerbuka(false)}
                className={`rounded-md px-3 py-2 text-sm ${
                  aktifSekarang(pathname, m.href)
                    ? 'bg-white/15 font-semibold text-white'
                    : 'text-white/80'
                }`}
              >
                {m.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
