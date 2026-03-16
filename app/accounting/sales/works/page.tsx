'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DailySalesData, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';

const fmtComma = (n: number) => n.toLocaleString();

export default function WorksTablePage() {
  const { profile } = useStore();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  // 날짜 목록 (열 헤더)
  const dates = useMemo(() =>
    data?.summary?.dailyTotals?.map(d => d.date).sort() || [],
  [data]);

  // 작품별 행 데이터 (매출 순 정렬)
  const rows = useMemo(() => {
    if (!data?.works) return [];
    return Object.entries(data.works).map(([name, salesRows]) => {
      const byDate: Record<string, number> = {};
      let total = 0;
      for (const r of salesRows) {
        byDate[r.date] = r.amount;
        total += r.amount;
      }
      return { name, byDate, total };
    }).sort((a, b) => b.total - a.total);
  }, [data]);

  // 날짜별 합계 (마지막 행)
  const dateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const row of rows) {
      for (const [date, amount] of Object.entries(row.byDate)) {
        totals[date] = (totals[date] || 0) + amount;
      }
    }
    return totals;
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">작품별 매출</h1>
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <Button key={p.days} variant={days === p.days ? 'default' : 'outline'} size="sm" onClick={() => setDays(p.days)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">로딩 중...</div>
      ) : !data || rows.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">데이터 없음</div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">
              {rows.length}개 작품 · {dates.length}일 · 총 {fmtShort(grandTotal)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="sticky left-0 z-10 bg-muted/80 backdrop-blur text-left py-2.5 px-3 font-semibold min-w-36">작품</th>
                    {dates.map(date => (
                      <th key={date} className="text-right py-2.5 px-2 font-medium text-muted-foreground whitespace-nowrap min-w-20">
                        {date.slice(5)}
                      </th>
                    ))}
                    <th className="sticky right-0 z-10 bg-muted/80 backdrop-blur text-right py-2.5 px-3 font-semibold min-w-24">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.name} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="sticky left-0 z-10 bg-card py-2 px-3 font-medium truncate max-w-48">
                        <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                        {row.name}
                      </td>
                      {dates.map(date => {
                        const amount = row.byDate[date] || 0;
                        // 해당 작품 내에서 최대/최소 강조
                        const amounts = Object.values(row.byDate);
                        const maxAmt = Math.max(...amounts);
                        const isMax = amount === maxAmt && amount > 0;
                        return (
                          <td key={date} className={`text-right py-2 px-2 tabular-nums ${amount === 0 ? 'text-muted-foreground/30' : ''} ${isMax ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : ''}`}>
                            {amount === 0 ? '-' : fmtComma(amount)}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-card text-right py-2 px-3 tabular-nums font-semibold">
                        {fmtComma(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/80 backdrop-blur py-2.5 px-3">합계</td>
                    {dates.map(date => (
                      <td key={date} className="text-right py-2.5 px-2 tabular-nums">
                        {fmtComma(dateTotals[date] || 0)}
                      </td>
                    ))}
                    <td className="sticky right-0 z-10 bg-muted/80 backdrop-blur text-right py-2.5 px-3 tabular-nums">
                      {fmtComma(grandTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
