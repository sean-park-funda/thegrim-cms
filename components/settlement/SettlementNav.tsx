'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/accounting/settlement', label: '대시보드' },
  { href: '/accounting/settlement/revenue', label: '작품별 수익' },
  { href: '/accounting/settlement/partner-revenue', label: '작가별 수익' },
  { href: '/accounting/settlement/settlements', label: '정산' },
  { href: '/accounting/settlement/mg', label: 'MG' },
  { href: '/accounting/settlement/partners', label: '파트너' },
  { href: '/accounting/settlement/works', label: '작품' },
];

export function SettlementNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b pb-2 mb-6 overflow-x-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
