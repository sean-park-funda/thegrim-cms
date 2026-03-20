'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';
import { ArrowUp, ArrowDown, Minus, Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

type Mode = 'weekly' | 'half' | 'custom';

interface GrowthRow {
  name: string;
  current: number;
  previous: number;
  change: number;
  growthPct: number;
}

function WeeklyChart({ data, workNames }: { data: DailySalesData; workNames: string[] }) {
  // Build weekly aggregation
  const weeklyData = useMemo(() => {
    const weeks: Record<string, Record<string, number>> = {};
    for (const [workName, rows] of Object.entries(data.works)) {
      if (!workNames.includes(workName)) continue;
      for (const row of rows) {
        const d = new Date(row.date);
        // ISO week start (Monday)
        const dayOfWeek = d.getDay() || 7;
        const monday = new Date(d);
        monday.setDate(d.getDate() - dayOfWeek + 1);
        const weekKey = monday.toISOString().slice(5, 10);
        if (!weeks[weekKey]) weeks[weekKey] = {};
        weeks[weekKey][workName] = (weeks[weekKey][workName] || 0) + row.amount;
      }
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, vals]) => ({ week, ...vals }));
  }, [data, workNames]);

  const top3 = workNames.slice(0, 3);

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={weeklyData}>
          <defs>
            {top3.map((name, i) => (
              <linearGradient key={name} id={`growth-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={WORK_COLORS[i]} stopOpacity={0.2} />
                <stop offset="100%" stopColor={WORK_COLORS[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
          <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8E8E93' }} dy={8} />
          <YAxis tickFormatter={fmtShort} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8E8E93' }} width={50} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-xl bg-white dark:bg-zinc-900 px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
                  <p className="text-sm font-semibold tracking-tight mb-2">{label}주</p>
                  {[...payload].sort((a: any, b: any) => (b.value || 0) - (a.value || 0)).map((p: any) => (
                    <div key={p.name} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-zinc-500 truncate max-w-28">{p.name}</span>
                      <span className="ml-auto tabular-nums font-medium">{fmtShort(p.value)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {top3.map((name, i) => (
            <Area
              key={name}
              type="monotone"
              dataKey={name}
              stroke={WORK_COLORS[i]}
              strokeWidth={2}
              fill={`url(#growth-grad-${i})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: WORK_COLORS[i] }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function GrowthPage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<Mode>('weekly');

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

  const rows: GrowthRow[] = useMemo(() => {
    if (!data?.works) return [];

    return Object.entries(data.works).map(([name, workRows]) => {
      const sorted = [...workRows].sort((a, b) => a.date.localeCompare(b.date));

      let current = 0, previous = 0;

      if (mode === 'weekly') {
        // Last 7 days vs previous 7 days
        const allDates = sorted.map(r => r.date);
        const cutoff = allDates.length >= 14 ? allDates[allDates.length - 7] : allDates[Math.floor(allDates.length / 2)];
        current = sorted.filter(r => r.date >= cutoff).reduce((s, r) => s + r.amount, 0);
        previous = sorted.filter(r => r.date < cutoff).reduce((s, r) => s + r.amount, 0);
        // Normalize previous to same period length
        const curDays = sorted.filter(r => r.date >= cutoff).length;
        const prevDays = sorted.filter(r => r.date < cutoff).length;
        if (prevDays > 0 && curDays > 0 && prevDays !== curDays) {
          previous = (previous / prevDays) * curDays;
        }
      } else {
        // half: split in middle
        const mid = Math.floor(sorted.length / 2);
        previous = sorted.slice(0, mid).reduce((s, r) => s + r.amount, 0);
        current = sorted.slice(mid).reduce((s, r) => s + r.amount, 0);
        // Normalize
        const prevLen = mid;
        const curLen = sorted.length - mid;
        if (prevLen > 0 && curLen > 0 && prevLen !== curLen) {
          previous = (previous / prevLen) * curLen;
        }
      }

      const change = current - previous;
      const growthPct = previous > 0 ? ((change) / previous) * 100 : current > 0 ? 100 : 0;

      return { name, current, previous: Math.round(previous), change: Math.round(change), growthPct: Math.round(growthPct * 10) / 10 };
    }).sort((a, b) => b.growthPct - a.growthPct);
  }, [data, mode]);

  const modes: { key: Mode; label: string }[] = [
    { key: 'weekly', label: '주간 비교' },
    { key: 'half', label: '전반/후반' },
  ];

  const workNames = rows.map(r => r.name);

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">성장률</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">작품별 매출 성장 추이를 분석합니다</p>
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
            {modes.map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  mode === m.key
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {m.label}
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
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">데이터 없음</div>
      ) : (
        <>
          {/* 주간 추이 차트 (top 3) */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold tracking-tight">주간 매출 추이</h2>
              <div className="flex items-center gap-3">
                {workNames.slice(0, 3).map((name, i) => (
                  <div key={name} className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: WORK_COLORS[i] }} />
                    <span className="truncate max-w-20">{name}</span>
                  </div>
                ))}
              </div>
            </div>
            <WeeklyChart data={data} workNames={workNames} />
          </div>

          {/* 성장률 테이블 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">작품별 성장률</h2>
              <span className="text-sm text-zinc-500">{rows.length}개 작품</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                    <th className="text-left py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 w-10">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 min-w-40">작품</th>
                    <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">이전 기간</th>
                    <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">현재 기간</th>
                    <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">변화량</th>
                    <th className="text-right py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 w-28">성장률</th>
                    <th className="py-3 px-4 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.name} className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors duration-150">
                      <td className="py-3 px-4">
                        <span className={`tabular-nums font-bold ${
                          i === 0 ? 'text-amber-500' : i < 3 ? 'text-zinc-400 font-semibold' : 'text-zinc-300 dark:text-zinc-600'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-52">
                        {r.name}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums text-zinc-500 dark:text-zinc-400">
                        {fmtShort(r.previous)}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                        {fmtShort(r.current)}
                      </td>
                      <td className={`text-right py-3 px-4 tabular-nums ${
                        r.change > 0 ? 'text-green-600 dark:text-green-400' : r.change < 0 ? 'text-red-500 dark:text-red-400' : 'text-zinc-400'
                      }`}>
                        {r.change > 0 ? '+' : ''}{fmtShort(r.change)}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`inline-flex items-center gap-1 tabular-nums font-semibold ${
                          r.growthPct > 0 ? 'text-green-600 dark:text-green-400'
                          : r.growthPct < 0 ? 'text-red-500 dark:text-red-400'
                          : 'text-zinc-400'
                        }`}>
                          {r.growthPct > 0 ? <ArrowUp className="h-3.5 w-3.5" />
                          : r.growthPct < 0 ? <ArrowDown className="h-3.5 w-3.5" />
                          : <Minus className="h-3.5 w-3.5" />}
                          {Math.abs(r.growthPct)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          {r.growthPct !== 0 && (
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                r.growthPct > 0 ? 'bg-green-500' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(Math.abs(r.growthPct), 100)}%` }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
