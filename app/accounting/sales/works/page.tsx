'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { DailySalesData, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu } from 'lucide-react';

const fmtComma = (n: number) => n.toLocaleString();

export default function WorksTablePage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
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

  const dates = useMemo(() =>
    data?.summary?.dailyTotals?.map(d => d.date).sort() || [],
  [data]);

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
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">작품별 매출</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">날짜별 작품 매출 상세 현황</p>
          </div>
          <button
            onClick={toggleSidebar}
            className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 w-fit">
          {PRESETS.map(p => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                days === p.days
                  ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : !data || rows.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">데이터 없음</div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
          {/* 요약 헤더 */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {rows.length}개 작품 · {dates.length}일
              </span>
              <span className="text-sm font-semibold tracking-tight">총 {fmtShort(grandTotal)}</span>
            </div>
          </div>

          {/* 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur text-left py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 min-w-40">
                    작품
                  </th>
                  {dates.map(date => {
                    const d = new Date(date);
                    const dayName = ['일','월','화','수','목','금','토'][d.getDay()];
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <th key={date} className="text-right py-3 px-2.5 font-medium whitespace-nowrap min-w-[5.5rem]">
                        <div className="text-zinc-500 dark:text-zinc-400">{date.slice(5)}</div>
                        <div className={`text-[10px] mt-0.5 ${isWeekend ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'}`}>{dayName}</div>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur text-right py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 min-w-28">
                    합계
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const amounts = Object.values(row.byDate);
                  const maxAmt = Math.max(...amounts);
                  return (
                    <tr key={row.name} className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors duration-150">
                      <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 py-2.5 px-4 font-medium truncate max-w-52">
                        <span className={`inline-block w-5 text-right mr-2 tabular-nums text-xs ${
                          i === 0 ? 'text-amber-500 font-bold' : i < 3 ? 'text-zinc-400 font-semibold' : 'text-zinc-300 dark:text-zinc-600'
                        }`}>{i + 1}</span>
                        <span className="text-zinc-900 dark:text-zinc-100">{row.name}</span>
                      </td>
                      {dates.map(date => {
                        const amount = row.byDate[date] || 0;
                        const isMax = amount === maxAmt && amount > 0;
                        return (
                          <td key={date} className={`text-right py-2.5 px-2.5 tabular-nums transition-colors ${
                            amount === 0
                              ? 'text-zinc-200 dark:text-zinc-700'
                              : isMax
                                ? 'text-blue-600 dark:text-blue-400 font-semibold'
                                : 'text-zinc-700 dark:text-zinc-300'
                          }`}>
                            {amount === 0 ? '-' : fmtComma(amount)}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-white dark:bg-zinc-900 text-right py-2.5 px-4 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {fmtComma(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur py-3 px-4 font-bold text-zinc-700 dark:text-zinc-200">
                    합계
                  </td>
                  {dates.map(date => (
                    <td key={date} className="text-right py-3 px-2.5 tabular-nums font-semibold text-zinc-700 dark:text-zinc-200">
                      {fmtComma(dateTotals[date] || 0)}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur text-right py-3 px-4 tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                    {fmtComma(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
