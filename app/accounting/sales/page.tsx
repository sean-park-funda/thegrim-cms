'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Button } from '@/components/ui/button';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu } from 'lucide-react';

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-xl border-none bg-white dark:bg-zinc-900 px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-80 overflow-y-auto">
      <p className="mb-2 text-sm font-semibold tracking-tight">{label}</p>
      {payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value).map((p) => (
        <div key={p.name} className="flex items-center gap-2.5 text-xs leading-relaxed py-0.5">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-500 dark:text-zinc-400 truncate max-w-32">{p.name}</span>
          <span className="ml-auto tabular-nums font-medium">{fmtShort(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs font-semibold flex justify-between">
          <span>합계</span>
          <span className="tabular-nums">{fmtShort(total)}</span>
        </div>
      )}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => {
        setData(d);
        if (d.summary?.workTotals) {
          setSelectedWorks(new Set(d.summary.workTotals.slice(0, 3).map(w => w.name)));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  const chartData = useMemo(() => {
    if (!data?.summary?.dailyTotals) return [];
    return data.summary.dailyTotals.map(({ date }) => {
      const point: Record<string, string | number> = { date: date.slice(5) };
      for (const [workName, rows] of Object.entries(data.works)) {
        if (selectedWorks.has(workName)) {
          const row = rows.find(r => r.date === date);
          point[workName] = row ? row.amount : 0;
        }
      }
      return point;
    });
  }, [data, selectedWorks]);

  const workNames = useMemo(() =>
    data?.summary?.workTotals?.map(w => w.name) || [],
  [data]);

  const toggleWork = (name: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* 헤더 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">매출</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">일별 매출 추이와 작품별 현황</p>
          </div>
          <button
            onClick={toggleSidebar}
            className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
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
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">데이터 없음</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '총 매출', value: fmtShort(data.summary.totalSales), sub: `${days}일간`, color: 'text-green-500' },
              { label: '일 평균', value: fmtShort(data.summary.dailyAverage), sub: '하루 평균 매출', color: 'text-blue-500' },
              { label: '작품 수', value: `${data.summary.workCount}개`, sub: '매출 발생 작품', color: 'text-purple-500' },
              { label: '1위 작품', value: data.summary.topWork?.name || '-', sub: data.summary.topWork ? fmtShort(data.summary.topWork.total) : '-', color: 'text-amber-500', isName: true },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl bg-white dark:bg-zinc-900 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 transition-all duration-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:-translate-y-0.5"
              >
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
                <p className={`${card.isName ? 'text-xl' : 'text-3xl'} font-bold tracking-tight mt-1 truncate`}>
                  {card.value}
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 차트 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold tracking-tight">일별 매출 추이</h2>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSelectedWorks(new Set(workNames))}
                  className="px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  전체
                </button>
                <button
                  onClick={() => setSelectedWorks(new Set())}
                  className="px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  해제
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {workNames.map((name, i) => {
                const color = WORK_COLORS[i % WORK_COLORS.length];
                const isSelected = selectedWorks.has(name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleWork(name)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                      isSelected
                        ? 'text-white shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }`}
                    style={isSelected ? { backgroundColor: color } : {}}
                  >
                    {!isSelected && <span className="h-1.5 w-1.5 rounded-full opacity-40" style={{ backgroundColor: color }} />}
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    {workNames.filter(n => selectedWorks.has(n)).map((name) => {
                      const color = WORK_COLORS[workNames.indexOf(name) % WORK_COLORS.length];
                      return (
                        <linearGradient key={name} id={`grad-${name.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800"
                    strokeDasharray=""
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#8E8E93' }}
                    dy={8}
                  />
                  <YAxis
                    tickFormatter={fmtShort}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#8E8E93' }}
                    width={50}
                    tickCount={5}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 16 }}
                  />
                  {workNames.filter(n => selectedWorks.has(n)).map((name) => {
                    const color = WORK_COLORS[workNames.indexOf(name) % WORK_COLORS.length];
                    return (
                      <Area
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={color}
                        strokeWidth={2}
                        fill={`url(#grad-${name.replace(/\s/g, '')})`}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, fill: 'var(--background, #fff)', stroke: color }}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 작품별 매출 순위 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800">
            <h2 className="text-lg font-semibold tracking-tight mb-5">작품별 매출 순위</h2>
            <div className="space-y-3">
              {data.summary.workTotals.map((w, i) => {
                const ratio = data.summary.workTotals[0]?.total
                  ? (w.total / data.summary.workTotals[0].total) * 100
                  : 0;
                const color = WORK_COLORS[i % WORK_COLORS.length];
                return (
                  <div key={w.name} className="flex items-center gap-3 group">
                    <span className={`text-sm font-bold w-6 text-right tabular-nums ${
                      i === 0 ? 'text-amber-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-zinc-300 dark:text-zinc-600'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium truncate">{w.name}</span>
                        <span className="text-sm tabular-nums font-semibold tracking-tight">{fmtShort(w.total)}</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{ width: `${ratio}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
