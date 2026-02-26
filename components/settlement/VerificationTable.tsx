'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useState } from 'react';

interface VerificationRow {
  partner_name: string;
  company_name: string;
  income_type: string;
  tax_id: string;
  is_target: string;
  work_name: string;
  gross_revenue: number;
  rs_rate: number;
  computed_share: number;
  db_share: number | null;
  has_discrepancy: boolean;
  is_mg: string;
  note: string;
}

interface Props {
  data: VerificationRow[];
  loading: boolean;
}

const fmt = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function VerificationTable({ data, loading }: Props) {
  const [search, setSearch] = useState('');
  const [showOnlyDiscrepancies, setShowOnlyDiscrepancies] = useState(false);

  if (loading) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>;

  const filtered = data.filter((r) => {
    const matchSearch =
      r.partner_name.includes(search) ||
      r.company_name.includes(search) ||
      r.work_name.includes(search);
    const matchDiscrepancy = !showOnlyDiscrepancies || r.has_discrepancy;
    return matchSearch && matchDiscrepancy;
  });

  const discrepancyCount = data.filter((r) => r.has_discrepancy).length;

  const totals = filtered.reduce(
    (acc, r) => ({
      gross_revenue: acc.gross_revenue + r.gross_revenue,
      computed_share: acc.computed_share + r.computed_share,
    }),
    { gross_revenue: 0, computed_share: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="파트너/작품 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showOnlyDiscrepancies}
            onChange={(e) => setShowOnlyDiscrepancies(e.target.checked)}
            className="rounded"
          />
          불일치만 보기
          {discrepancyCount > 0 && (
            <span className="text-amber-600 font-medium">({discrepancyCount}건)</span>
          )}
        </label>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left">NO</th>
              <th className="px-3 py-2 text-left">대상자</th>
              <th className="px-3 py-2 text-left">거래처명</th>
              <th className="px-3 py-2 text-left">소득구분</th>
              <th className="px-3 py-2 text-center">정산대상</th>
              <th className="px-3 py-2 text-left">작품명</th>
              <th className="px-3 py-2 text-right">매출액</th>
              <th className="px-3 py-2 text-right">RS요율</th>
              <th className="px-3 py-2 text-right">수익분배(계산)</th>
              <th className="px-3 py-2 text-right">수익분배(DB)</th>
              <th className="px-3 py-2 text-center">MG</th>
              <th className="px-3 py-2 text-left">특이사항</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={`${r.partner_name}-${r.work_name}`}
                  className={`border-b ${r.has_discrepancy ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/30'}`}
                >
                  <td className="px-3 py-2 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.partner_name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.company_name}</td>
                  <td className="px-3 py-2">{r.income_type}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={r.is_target === '대상' ? 'text-green-600' : 'text-muted-foreground'}>
                      {r.is_target}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.work_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.gross_revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(r.rs_rate)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.computed_share)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.has_discrepancy ? 'text-amber-600 font-medium' : ''}`}>
                    {r.db_share !== null ? fmt(r.db_share) : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">{r.is_mg}</td>
                  <td className="px-3 py-2 text-xs max-w-[150px] truncate" title={r.note}>{r.note}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td colSpan={6} className="px-3 py-2">합계 ({filtered.length}건)</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.gross_revenue)}</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totals.computed_share)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
