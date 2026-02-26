'use client';

import { useState, Fragment } from 'react';
import { RsRevenue, RsWorkPartner } from '@/lib/types/settlement';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface RevenueTableProps {
  revenues: RsRevenue[];
  loading?: boolean;
  search?: string;
  workPartners?: RsWorkPartner[];
}

export function RevenueTable({ revenues, loading, search = '', workPartners = [] }: RevenueTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>;
  }

  if (revenues.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">수익 데이터가 없습니다.</div>;
  }

  const filtered = search
    ? revenues.filter(r => (r.work?.name || '').toLowerCase().includes(search.toLowerCase()))
    : revenues;

  const totalAll = filtered.reduce((s, r) => s + Number(r.total), 0);

  // Group work-partners by work_id
  const wpByWork = new Map<string, RsWorkPartner[]>();
  for (const wp of workPartners) {
    const list = wpByWork.get(wp.work_id) || [];
    list.push(wp);
    wpByWork.set(wp.work_id, list);
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-3 font-medium w-6"></th>
            <th className="py-2 px-3 font-medium">작품명</th>
            <th className="py-2 px-3 font-medium text-right">국내유료</th>
            <th className="py-2 px-3 font-medium text-right">글로벌유료</th>
            <th className="py-2 px-3 font-medium text-right">국내광고</th>
            <th className="py-2 px-3 font-medium text-right">글로벌광고</th>
            <th className="py-2 px-3 font-medium text-right">2차사업</th>
            <th className="py-2 px-3 font-medium text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const wps = wpByWork.get(r.work_id) || [];
            const isExpanded = expandedId === r.id;
            const hasPartners = wps.length > 0;
            const total = Number(r.total);

            return (
              <Fragment key={r.id}>
                <tr
                  className={`border-b hover:bg-muted/50 ${hasPartners ? 'cursor-pointer' : ''}`}
                  onClick={() => hasPartners && toggleExpand(r.id)}
                >
                  <td className="py-2 px-1 text-muted-foreground">
                    {hasPartners && (
                      isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="py-2 px-3">{r.work?.name || r.work_id}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Number(r.domestic_paid).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Number(r.global_paid).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Number(r.domestic_ad).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Number(r.global_ad).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{Number(r.secondary).toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{total.toLocaleString()}</td>
                </tr>
                {isExpanded && wps.map((wp) => (
                  <tr key={`${r.id}-${wp.id}`} className="bg-muted/20 border-b text-xs">
                    <td></td>
                    <td className="py-1.5 px-3 pl-8 text-muted-foreground">
                      ↳ {wp.partner?.name || wp.partner_id}
                      <span className="ml-2 text-primary">({(wp.rs_rate * 100).toFixed(1)}%)</span>
                      {wp.is_mg_applied && <span className="ml-1 text-amber-600">MG</span>}
                    </td>
                    <td colSpan={5}></td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {Math.round(total * wp.rs_rate).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td></td>
            <td className="py-2 px-3">합계{search ? ` (${filtered.length}건)` : ''}</td>
            <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, r) => s + Number(r.domestic_paid), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, r) => s + Number(r.global_paid), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, r) => s + Number(r.domestic_ad), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, r) => s + Number(r.global_ad), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{filtered.reduce((s, r) => s + Number(r.secondary), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{totalAll.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
