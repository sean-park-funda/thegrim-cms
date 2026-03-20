'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, dateStr, AggMode, WorkFilter, aggregateData } from '@/lib/sales/types';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu, Sparkles, CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DateRange } from 'react-day-picker';

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

const AGG_OPTIONS: { label: string; value: AggMode }[] = [
  { label: '일별', value: 'daily' },
  { label: '주별', value: 'weekly' },
  { label: '월별', value: 'monthly' },
];

const FILTER_OPTIONS: { label: string; value: WorkFilter }[] = [
  { label: '전체', value: 'all' },
  { label: '연재중', value: 'active' },
  { label: '완결', value: 'completed' },
];

export default function SalesDashboardPage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  const [aggMode, setAggMode] = useState<AggMode>('daily');
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // 날짜 범위: 프리셋 또는 캘린더
  const { from, to } = useMemo(() => {
    if (dateRange?.from && dateRange?.to) {
      return { from: dateStr(dateRange.from), to: dateStr(dateRange.to) };
    }
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    return { from: dateStr(fromDate), to: dateStr(now) };
  }, [days, dateRange]);

  const isCustomRange = !!(dateRange?.from && dateRange?.to);

  useEffect(() => {
    if (!profile || !canViewSales(profile.role)) return;
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

  if (!profile || !canViewSales(profile.role)) return null;

  // 작품 필터링
  const filteredWorkNames = useMemo(() => {
    if (!data?.summary?.workTotals) return [];
    return data.summary.workTotals
      .filter(w => {
        if (workFilter === 'all') return true;
        const status = data.workStatus?.[w.name];
        const isCompleted = status?.serialEndDate != null;
        return workFilter === 'completed' ? isCompleted : !isCompleted;
      })
      .map(w => w.name);
  }, [data, workFilter]);

  // 필터 적용된 works 데이터
  const filteredWorks = useMemo(() => {
    if (!data?.works) return {};
    const result: Record<string, { date: string; amount: number }[]> = {};
    for (const name of filteredWorkNames) {
      if (data.works[name]) result[name] = data.works[name];
    }
    return result;
  }, [data, filteredWorkNames]);

  // 필터 적용된 dailyTotals
  const filteredDailyTotals = useMemo(() => {
    if (!data?.summary?.dailyTotals) return [];
    if (workFilter === 'all') return data.summary.dailyTotals;
    // 필터된 작품만으로 일별 합계 재계산
    const totals: Record<string, number> = {};
    for (const name of filteredWorkNames) {
      for (const row of data.works[name] || []) {
        totals[row.date] = (totals[row.date] || 0) + row.amount;
      }
    }
    return Object.entries(totals)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, filteredWorkNames, workFilter]);

  // 집계 적용
  const agg = useMemo(() =>
    aggregateData(filteredDailyTotals, filteredWorks, aggMode),
  [filteredDailyTotals, filteredWorks, aggMode]);

  const chartData = useMemo(() => {
    if (!agg.totals.length) return [];
    return agg.totals.map(({ date }) => {
      const point: Record<string, string | number> = {
        date: aggMode === 'monthly' ? date : date.slice(5),
      };
      for (const [workName, rows] of Object.entries(agg.works)) {
        if (selectedWorks.has(workName)) {
          const row = rows.find(r => r.date === date);
          point[workName] = row ? row.amount : 0;
        }
      }
      return point;
    });
  }, [agg, selectedWorks, aggMode]);

  // 필터 적용된 요약
  const filteredSummary = useMemo(() => {
    if (!data?.summary) return null;
    if (workFilter === 'all') return data.summary;
    const totalSales = filteredDailyTotals.reduce((s, d) => s + d.total, 0);
    const numDays = filteredDailyTotals.length;
    const workTotals = filteredWorkNames.map(name => ({
      name,
      total: (data.works[name] || []).reduce((s, r) => s + r.amount, 0),
    })).sort((a, b) => b.total - a.total);
    return {
      ...data.summary,
      totalSales,
      dailyAverage: numDays > 0 ? totalSales / numDays : 0,
      workCount: workTotals.length,
      topWork: workTotals[0] || null,
      workTotals,
    };
  }, [data, filteredDailyTotals, filteredWorkNames, workFilter]);

  const toggleWork = (name: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handlePreset = (d: number) => {
    setDays(d);
    setDateRange(undefined);
  };

  const handleDateRangeSelect = (range: DateRange | undefined) => {
    setDateRange(range);
    if (range?.from && range?.to) {
      setCalendarOpen(false);
    }
  };

  const displayDays = isCustomRange
    ? Math.ceil((dateRange!.to!.getTime() - dateRange!.from!.getTime()) / 86400000)
    : days;

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
            className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* 프리셋 버튼 */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5">
            {PRESETS.map(p => (
              <button
                key={p.days}
                onClick={() => handlePreset(p.days)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  !isCustomRange && days === p.days
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* 날짜 범위 선택기 */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200 ${
                  isCustomRange
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {isCustomRange
                  ? `${format(dateRange!.from!, 'M.d', { locale: ko })} - ${format(dateRange!.to!, 'M.d', { locale: ko })}`
                  : '기간 선택'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
                locale={ko}
                disabled={{ after: new Date() }}
              />
            </PopoverContent>
          </Popover>
          {/* 완결/연재 필터 */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5">
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => setWorkFilter(f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  workFilter === f.value
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {f.label}
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
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: '총 매출', value: fmtShort(filteredSummary?.totalSales || 0), sub: `${displayDays}일간`, color: 'text-green-500' },
              { label: '일 평균', value: fmtShort(filteredSummary?.dailyAverage || 0), sub: '하루 평균 매출', color: 'text-blue-500' },
              { label: '작품 수', value: `${filteredSummary?.workCount || 0}개`, sub: workFilter === 'all' ? '매출 발생 작품' : workFilter === 'active' ? '연재중 작품' : '완결 작품', color: 'text-purple-500' },
              { label: '1위 작품', value: filteredSummary?.topWork?.name || '-', sub: filteredSummary?.topWork ? fmtShort(filteredSummary.topWork.total) : '-', color: 'text-amber-500', isName: true },
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
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold tracking-tight">매출 추이</h2>
                {/* 집계 토글 */}
                <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
                  {AGG_OPTIONS.map(a => (
                    <button
                      key={a.value}
                      onClick={() => setAggMode(a.value)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all duration-200 ${
                        aggMode === a.value
                          ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setSelectedWorks(new Set(filteredWorkNames))}
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
              {filteredWorkNames.map((name, i) => {
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
                    {filteredWorkNames.filter(n => selectedWorks.has(n)).map((name, i) => {
                      const color = WORK_COLORS[i % WORK_COLORS.length];
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
                  {filteredWorkNames.filter(n => selectedWorks.has(n)).map((name, i) => {
                    const color = WORK_COLORS[i % WORK_COLORS.length];
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
              {(filteredSummary?.workTotals || []).map((w, i) => {
                const ratio = (filteredSummary?.workTotals || [])[0]?.total
                  ? (w.total / (filteredSummary?.workTotals || [])[0].total) * 100
                  : 0;
                const color = WORK_COLORS[i % WORK_COLORS.length];
                const status = data.workStatus?.[w.name];
                return (
                  <div key={w.name} className="flex items-center gap-3 group">
                    <span className={`text-sm font-bold w-6 text-right tabular-nums ${
                      i === 0 ? 'text-amber-500' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-amber-700' : 'text-zinc-300 dark:text-zinc-600'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium truncate flex items-center gap-1.5">
                          {w.name}
                          {status?.serialEndDate && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400">완결</span>
                          )}
                        </span>
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

      {/* AI 검색 FAB */}
      <Link
        href="/accounting/sales/chat"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_4px_16px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_24px_rgba(99,102,241,0.5)] hover:scale-105 transition-all duration-300"
      >
        <Sparkles className="h-6 w-6 text-white" />
      </Link>
    </div>
  );
}
