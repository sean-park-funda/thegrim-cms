'use client';

import { usePathname } from 'next/navigation';
import { useSettlementStore } from '@/lib/store/useSettlementStore';

const LABELS: Record<string, string> = {
  '/accounting/settlement': '대시보드',
  '/accounting/settlement/works': '작품',
  '/accounting/settlement/partners': '파트너',
  '/accounting/settlement/settlements': '정산 내역',
  '/accounting/settlement/mg': 'MG 현황',
  '/accounting/settlement/insurance': '예고료',
  '/accounting/settlement/staff': '인력',
  '/accounting/settlement/contracts': '계약',
  '/accounting/settlement/revenue': '매출 현황',
  '/accounting/settlement/partner-revenue': '파트너별 매출',
  '/accounting/settlement/verification': '검증',
  '/accounting/settlement/guide': '서비스 설명서',
  '/accounting/settlement/upload': '업로드',
};

export function BreadcrumbNav() {
  const pathname = usePathname();
  const { selectedMonth } = useSettlementStore();

  const label = LABELS[pathname] || getDeepLabel(pathname);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground text-xs tabular-nums">{selectedMonth}</span>
    </div>
  );
}

function getDeepLabel(pathname: string): string {
  if (pathname.includes('/works/')) return '작품 상세';
  if (pathname.includes('/partners/') && pathname.includes('/statement')) return '정산서';
  if (pathname.includes('/partners/')) return '파트너 상세';
  if (pathname.includes('/staff/')) return '인력 상세';
  return 'RS 정산';
}
