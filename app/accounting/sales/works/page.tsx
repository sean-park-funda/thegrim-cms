'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { DailySalesData, fmtShort, dateStr, AggMode, aggregateData } from '@/lib/sales/types';
import { getSlugByWorkName, getAllTitles, TEAM_LABELS, TeamLabel, TitleMasterInfo } from '@/lib/sales/title-master-data';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu, Search } from 'lucide-react';

const fmtComma = (n: number) => n.toLocaleString();

type StatusFilter = 'all' | '연재중' | '완결' | '휴재' | '준비중';

const PERIOD_MODES: { mode: AggMode; label: string }[] = [
  { mode: 'daily', label: '일별' },
  { mode: 'weekly', label: '주별' },
  { mode: 'monthly', label: '월별' },
  { mode: 'quarterly', label: '분기별' },
  { mode: 'yearly', label: '연도별' },
];

function getDateRangeForMode(mode: AggMode): { from: string; to: string } {
  const now = new Date();
  const to = dateStr(now);
  const fromDate = new Date(now);
  switch (mode) {
    case 'daily': fromDate.setDate(fromDate.getDate() - 30); break;
    case 'weekly': fromDate.setDate(fromDate.getDate() - 84); break;
    case 'monthly': fromDate.setFullYear(fromDate.getFullYear() - 1); break;
    case 'quarterly': fromDate.setFullYear(fromDate.getFullYear() - 2); break;
    case 'yearly': fromDate.setFullYear(fromDate.getFullYear() - 3); break;
  }
  return { from: dateStr(fromDate), to };
}

function fmtColumnHeader(date: string, mode: AggMode): { main: string; sub?: string } {
  if (mode === 'yearly') return { main: `${date}년` };
  if (mode === 'quarterly') {
    const [y, q] = date.split('-Q');
    return { main: `${q}분기`, sub: y };
  }
  if (mode === 'monthly') {
    const m = parseInt(date.slice(5, 7), 10);
    return { main: `${m}월`, sub: date.slice(0, 4) };
  }
  if (mode === 'weekly') {
    const mon = new Date(date);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return {
      main: `${mon.getMonth() + 1}/${mon.getDate()}`,
      sub: `~${sun.getMonth() + 1}/${sun.getDate()}`,
    };
  }
  const d = new Date(date);
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  return { main: date.slice(5), sub: dayName, isWeekend } as { main: string; sub?: string; isWeekend?: boolean };
}

function periodUnit(mode: AggMode): string {
  switch (mode) {
    case 'daily': return '일';
    case 'weekly': return '주';
    case 'monthly': return '개월';
    case 'quarterly': return '분기';
    case 'yearly': return '년';
  }
}

export default function WorksTablePage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aggMode, setAggMode] = useState<AggMode>('daily');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [labelFilter, setLabelFilter] = useState<TeamLabel | 'all'>('all');

  const titles = useMemo(() => getAllTitles(), []);
  const titleMap = useMemo(() => {
    const m = new Map<string, TitleMasterInfo>();
    for (const t of titles) m.set(t.title, t);
    return m;
  }, [titles]);

  const defaultRange = useMemo(() => getDateRangeForMode(aggMode), [aggMode]);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const from = customFrom || defaultRange.from;
  const to = customTo || defaultRange.to;

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

  const agg = useMemo(() => {
    if (!data?.summary?.dailyTotals || !data?.works) return null;
    return aggregateData(data.summary.dailyTotals, data.works, aggMode);
  }, [data, aggMode]);

  const dates = useMemo(() =>
    agg?.totals?.map(d => d.date).sort() || [],
  [agg]);

  const rows = useMemo(() => {
    if (!agg?.works) return [];
    return Object.entries(agg.works)
      .map(([name, salesRows]) => {
        const byDate: Record<string, number> = {};
        let total = 0;
        for (const r of salesRows) {
          byDate[r.date] = (byDate[r.date] || 0) + r.amount;
          total += r.amount;
        }
        const titleInfo = titleMap.get(name);
        return { name, byDate, total, titleInfo };
      })
      .filter(row => {
        if (statusFilter !== 'all') {
          if (!row.titleInfo || row.titleInfo.status !== statusFilter) return false;
        }
        if (labelFilter !== 'all') {
          if (!row.titleInfo || row.titleInfo.teamLabel !== labelFilter) return false;
        }
        if (search) {
          const q = search.toLowerCase();
          const match = row.name.toLowerCase().includes(q) ||
            row.titleInfo?.creators.some(c => c.name.toLowerCase().includes(q)) ||
            row.titleInfo?.mainGenre.toLowerCase().includes(q);
          if (!match) return false;
        }
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [agg, titleMap, statusFilter, labelFilter, search]);

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

  const statusCounts = useMemo(() => {
    if (!agg?.works) return { all: 0, '연재중': 0, '완결': 0, '휴재': 0, '준비중': 0 };
    const counts: Record<string, number> = { all: 0, '연재중': 0, '완결': 0, '휴재': 0, '준비중': 0 };
    for (const name of Object.keys(agg.works)) {
      counts.all++;
      const t = titleMap.get(name);
      if (t && counts[t.status] !== undefined) counts[t.status]++;
    }
    return counts;
  }, [agg, titleMap]);

  return (
    <div className="space-y-6 max-w-[1800px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">작품별 매출 확인하기</h1>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* 필터 영역 */}
      <div className="space-y-3">
        {/* 기간 + 검색 + 집계 모드 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom || defaultRange.from}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <span className="text-zinc-400 text-sm">~</span>
            <input
              type="date"
              value={customTo || defaultRange.to}
              onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            {(customFrom || customTo) && (
              <button
                onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              >
                초기화
              </button>
            )}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="작품명, 작가, 장르 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 w-fit">
            {PERIOD_MODES.map(p => (
              <button
                key={p.mode}
                onClick={() => setAggMode(p.mode)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                  aggMode === p.mode
                    ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* 상태 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">상태</span>
          {([
            { value: 'all' as const, label: '전체' },
            { value: '연재중' as const, label: '연재중' },
            { value: '완결' as const, label: '완결' },
            { value: '휴재' as const, label: '휴재' },
            { value: '준비중' as const, label: '준비중' },
          ]).map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all duration-200 ${
                statusFilter === f.value
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              {f.label} <span className="ml-1 tabular-nums">{statusCounts[f.value] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* 레이블 필터 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">레이블</span>
          {([
            { value: 'all' as const, label: '전체' },
            ...TEAM_LABELS.map(l => ({ value: l, label: l })),
          ]).map(f => (
            <button
              key={f.value}
              onClick={() => setLabelFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-all duration-200 ${
                labelFilter === f.value
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : !data || rows.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">
          {search || statusFilter !== 'all' || labelFilter !== 'all' ? '검색 결과가 없습니다' : '데이터 없음'}
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {rows.length}개 작품 · {dates.length}{periodUnit(aggMode)}
              </span>
              <span className="text-sm font-semibold tracking-tight">총 {fmtShort(grandTotal)}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                  <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800/80 backdrop-blur text-left py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300 min-w-40">
                    작품
                  </th>
                  {dates.map(date => {
                    const h = fmtColumnHeader(date, aggMode) as { main: string; sub?: string; isWeekend?: boolean };
                    return (
                      <th key={date} className="text-right py-3 px-2.5 font-medium whitespace-nowrap min-w-[5.5rem]">
                        <div className="text-zinc-500 dark:text-zinc-400">{h.main}</div>
                        {h.sub && (
                          <div className={`text-[10px] mt-0.5 ${h.isWeekend ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                            {h.sub}
                          </div>
                        )}
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
                  const slug = getSlugByWorkName(row.name);
                  return (
                    <tr key={row.name} className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors duration-150">
                      <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 py-2.5 px-4 font-medium truncate max-w-52">
                        <span className={`inline-block w-5 text-right mr-2 tabular-nums text-xs ${
                          i === 0 ? 'text-amber-500 font-bold' : i < 3 ? 'text-zinc-400 font-semibold' : 'text-zinc-300 dark:text-zinc-600'
                        }`}>{i + 1}</span>
                        {slug ? (
                          <Link
                            href={`/accounting/sales/master/${slug}`}
                            className="text-zinc-900 dark:text-zinc-100 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors"
                          >
                            {row.name}
                          </Link>
                        ) : (
                          <span className="text-zinc-900 dark:text-zinc-100">{row.name}</span>
                        )}
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
