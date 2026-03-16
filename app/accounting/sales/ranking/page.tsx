'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';
import { Trophy, Medal, ArrowUp, ArrowDown, Minus } from 'lucide-react';

type SortKey = 'total' | 'avg' | 'max' | 'growth';

interface RankRow {
  rank: number;
  name: string;
  total: number;
  avg: number;
  max: number;
  maxDate: string;
  min: number;
  days: number;
  share: number;
  growth: number | null; // 전반기 대비 후반기 증감률
}

export default function RankingPage() {
  const { profile } = useStore();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>('total');

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

  const rankings: RankRow[] = useMemo(() => {
    if (!data?.works) return [];
    const grandTotal = data.summary.totalSales || 1;
    const midDate = data.summary.dailyTotals[Math.floor(data.summary.dailyTotals.length / 2)]?.date;

    return Object.entries(data.works).map(([name, rows]) => {
      const amounts = rows.map(r => r.amount);
      const total = amounts.reduce((a, b) => a + b, 0);
      const avg = amounts.length ? total / amounts.length : 0;
      const max = Math.max(...amounts, 0);
      const min = amounts.length ? Math.min(...amounts) : 0;
      const maxDate = rows.find(r => r.amount === max)?.date || '';

      let growth: number | null = null;
      if (midDate && amounts.length >= 4) {
        const first = rows.filter(r => r.date < midDate).reduce((s, r) => s + r.amount, 0);
        const second = rows.filter(r => r.date >= midDate).reduce((s, r) => s + r.amount, 0);
        if (first > 0) growth = ((second - first) / first) * 100;
      }

      return { rank: 0, name, total, avg: Math.round(avg), max, min, maxDate, days: amounts.length, share: (total / grandTotal) * 100, growth };
    }).sort((a, b) => {
      if (sortKey === 'growth') return (b.growth ?? -999) - (a.growth ?? -999);
      return b[sortKey] - a[sortKey];
    }).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [data, sortKey]);

  const sortButtons: { key: SortKey; label: string }[] = [
    { key: 'total', label: '총매출' },
    { key: 'avg', label: '일평균' },
    { key: 'max', label: '최고매출' },
    { key: 'growth', label: '성장률' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">매출 랭킹</h1>
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
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>작품별 순위 ({days}일)</CardTitle>
              <div className="flex gap-1">
                {sortButtons.map(s => (
                  <Button key={s.key} variant={sortKey === s.key ? 'default' : 'ghost'} size="sm" className="text-xs" onClick={() => setSortKey(s.key)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-center py-2 w-10">#</th>
                    <th className="text-left py-2 pr-4">작품</th>
                    <th className="text-right py-2 px-2">총 매출</th>
                    <th className="text-right py-2 px-2">점유율</th>
                    <th className="text-right py-2 px-2">일 평균</th>
                    <th className="text-right py-2 px-2">최고</th>
                    <th className="text-right py-2 px-2">최저</th>
                    <th className="text-right py-2 px-2">성장률</th>
                    <th className="text-right py-2 pl-2">피크일</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r) => {
                    const RankIcon = r.rank === 1 ? Trophy : r.rank <= 3 ? Medal : null;
                    const rankColor = r.rank === 1 ? 'text-yellow-500' : r.rank === 2 ? 'text-zinc-400' : r.rank === 3 ? 'text-amber-700' : 'text-muted-foreground';
                    return (
                      <tr key={r.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className={`text-center py-3 font-bold ${rankColor}`}>
                          {RankIcon ? <RankIcon className="h-4 w-4 mx-auto" /> : r.rank}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: WORK_COLORS[(r.rank - 1) % WORK_COLORS.length] }} />
                            <span className="font-medium truncate max-w-48">{r.name}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-2 tabular-nums font-semibold">{fmtShort(r.total)}</td>
                        <td className="text-right py-3 px-2 tabular-nums text-muted-foreground">{r.share.toFixed(1)}%</td>
                        <td className="text-right py-3 px-2 tabular-nums">{fmtShort(r.avg)}</td>
                        <td className="text-right py-3 px-2 tabular-nums text-green-600">{fmtShort(r.max)}</td>
                        <td className="text-right py-3 px-2 tabular-nums text-red-500">{fmtShort(r.min)}</td>
                        <td className="text-right py-3 px-2">
                          {r.growth !== null ? (
                            <span className={`inline-flex items-center gap-0.5 tabular-nums ${r.growth > 0 ? 'text-green-600' : r.growth < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {r.growth > 0 ? <ArrowUp className="h-3 w-3" /> : r.growth < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                              {Math.abs(r.growth).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="text-right py-3 pl-2 text-xs text-muted-foreground">{r.maxDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
