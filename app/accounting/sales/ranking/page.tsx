'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';
import { useSidebar } from '@/components/ui/sidebar';
import { ArrowUp, ArrowDown, Minus, Menu } from 'lucide-react';

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
  const { toggleSidebar } = useSidebar();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortKey, setSortKey] = useState<SortKey>('total');

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewSales(profile.role)) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewSales(profile.role)) return null;

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
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">랭킹</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">작품별 매출 순위</p>
          </div>
          <button
            onClick={toggleSidebar}
            className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5">
            {sortButtons.map(s => (
              <button
                key={s.key}
                onClick={() => setSortKey(s.key)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  sortKey === s.key
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5">
            {PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  days === p.days
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="text-center py-3 px-3 w-10 font-semibold text-zinc-600 dark:text-zinc-300">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">작품</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">총 매출</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">점유율</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">일 평균</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">최고</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">최저</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">성장률</th>
                  <th className="text-right py-3 px-3 font-medium text-zinc-500 dark:text-zinc-400">피크일</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const rankColor = r.rank === 1 ? 'text-amber-500' : r.rank <= 3 ? 'text-zinc-400 font-semibold' : 'text-zinc-300 dark:text-zinc-600';
                  return (
                    <tr key={r.name} className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors duration-150">
                      <td className={`text-center py-3 px-3 font-bold tabular-nums ${rankColor}`}>
                        {r.rank}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: WORK_COLORS[(r.rank - 1) % WORK_COLORS.length] }} />
                          <span className="font-medium truncate max-w-48 text-zinc-900 dark:text-zinc-100">{r.name}</span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-3 tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">{fmtShort(r.total)}</td>
                      <td className="text-right py-3 px-3 tabular-nums text-zinc-500 dark:text-zinc-400">{r.share.toFixed(1)}%</td>
                      <td className="text-right py-3 px-3 tabular-nums text-zinc-700 dark:text-zinc-300">{fmtShort(r.avg)}</td>
                      <td className="text-right py-3 px-3 tabular-nums text-green-600 dark:text-green-400">{fmtShort(r.max)}</td>
                      <td className="text-right py-3 px-3 tabular-nums text-red-500 dark:text-red-400">{fmtShort(r.min)}</td>
                      <td className="text-right py-3 px-3">
                        {r.growth !== null ? (
                          <span className={`inline-flex items-center gap-0.5 tabular-nums font-medium ${
                            r.growth > 0 ? 'text-green-600 dark:text-green-400' : r.growth < 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-400'
                          }`}>
                            {r.growth > 0 ? <ArrowUp className="h-3 w-3" /> : r.growth < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {Math.abs(r.growth).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-zinc-300 dark:text-zinc-600">-</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-3 text-zinc-400 dark:text-zinc-500">{r.maxDate?.slice(5)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
