'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Users, BarChart3, BookOpenText } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  individual_employee: '개인(임직원)',
  individual_simple_tax: '개인(간이)',
  domestic_corp: '사업자(국내)',
  foreign_corp: '사업자(해외)',
  naver: '사업자(네이버)',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : n < 0 ? n.toLocaleString() : '-');

interface MgBalanceRow {
  partner_id: string;
  partner: { id: string; name: string; company_name: string | null; partner_type: string };
  total_mg: number;
  total_deducted: number;
  pending_deduction: number;
  remaining: number;
  works: string;
  entry_count: number;
}

export default function MgPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [mgBalances, setMgBalances] = useState<MgBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch(`/api/accounting/settlement/mg?month=${selectedMonth}`);
      const data = await res.json();
      setMgBalances(data.mg_balances || []);
    } catch (e) {
      console.error('MG 현황 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile, selectedMonth]);

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const searched = search
    ? mgBalances.filter(mg =>
        (mg.partner?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (mg.partner?.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (mg.works || '').toLowerCase().includes(search.toLowerCase())
      )
    : mgBalances;

  const filtered = [...searched].sort((a, b) =>
    (a.partner?.name || '').localeCompare(b.partner?.name || '', 'ko')
  );

  const totals = filtered.reduce(
    (acc, mg) => ({
      total_mg: acc.total_mg + mg.total_mg,
      total_deducted: acc.total_deducted + mg.total_deducted,
      pending_deduction: acc.pending_deduction + mg.pending_deduction,
      remaining: acc.remaining + mg.remaining,
    }),
    { total_mg: 0, total_deducted: 0, pending_deduction: 0, remaining: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" className="gap-1.5">
          <BarChart3 className="h-4 w-4" />
          집계
        </Button>
        <Link href="/accounting/settlement/mg/ledger">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <BookOpenText className="h-4 w-4" />
            원장
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>MG현황 집계 ({selectedMonth})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="파트너, 거래처, 작품 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-60"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : mgBalances.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">MG 데이터가 없습니다.</div>
          ) : (
            <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {filtered.map((mg) => (
                <div key={mg.partner_id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        href={`/accounting/settlement/partners/${mg.partner_id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {mg.partner?.name || '-'}
                      </Link>
                      <Badge variant="secondary" className="text-xs ml-2">
                        {PARTNER_TYPE_LABELS[mg.partner?.partner_type || ''] || '-'}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{mg.works || '-'}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">MG 총액</span>
                      <span className="tabular-nums">{fmt(mg.total_mg)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">확정 차감</span>
                      <span className="tabular-nums text-red-600">
                        {mg.total_deducted > 0 ? `-${mg.total_deducted.toLocaleString()}` : '-'}
                      </span>
                    </div>
                    {mg.pending_deduction > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground block">미확정 차감</span>
                        <span className="tabular-nums text-blue-600">
                          -{mg.pending_deduction.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-muted-foreground block">MG 잔액</span>
                      <span className={`tabular-nums font-semibold ${mg.remaining > 0 ? 'text-orange-600' : ''}`}>
                        {fmt(mg.remaining)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="border-t-2 pt-3 px-1 flex justify-between font-semibold text-sm">
                <span>합계 ({filtered.length}건)</span>
                <span className="tabular-nums text-orange-600">{totals.remaining.toLocaleString()}</span>
              </div>
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium w-8">NO</th>
                    <th className="py-2 px-3 font-medium">파트너명</th>
                    <th className="py-2 px-3 font-medium">거래처명</th>
                    <th className="py-2 px-3 font-medium">소득구분</th>
                    <th className="py-2 px-3 font-medium">작품명</th>
                    <th className="py-2 px-3 font-medium text-right">MG 총액</th>
                    <th className="py-2 px-3 font-medium text-right">확정 차감</th>
                    <th className="py-2 px-3 font-medium text-right">미확정 차감</th>
                    <th className="py-2 px-3 font-medium text-right">MG 잔액</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((mg, i) => (
                    <tr key={mg.partner_id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-3 font-medium">
                        <Link
                          href={`/accounting/settlement/partners/${mg.partner_id}`}
                          className="text-primary hover:underline"
                        >
                          {mg.partner?.name || '-'}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{mg.partner?.company_name || '-'}</td>
                      <td className="py-2 px-3">
                        <Badge variant="secondary" className="text-xs">
                          {PARTNER_TYPE_LABELS[mg.partner?.partner_type || ''] || '-'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">{mg.works || '-'}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(mg.total_mg)}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-600">
                        {mg.total_deducted > 0 ? `-${mg.total_deducted.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-blue-600">
                        {mg.pending_deduction > 0 ? `-${mg.pending_deduction.toLocaleString()}` : '-'}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${mg.remaining > 0 ? 'text-orange-600' : ''}`}>
                        {fmt(mg.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3">합계 ({filtered.length}건)</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right tabular-nums">{totals.total_mg.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-red-600">
                      {totals.total_deducted > 0 ? `-${totals.total_deducted.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-600">
                      {totals.pending_deduction > 0 ? `-${totals.pending_deduction.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-orange-600">{totals.remaining.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
