'use client';

import { useEffect, useState, useMemo, useRef, Fragment } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { DailySalesData, fmtShort, dateStr, AggMode, aggregateData, normalizeSalesData } from '@/lib/sales/types';
import { getSlugByWorkName, fetchAllTitlesFromDB, TEAM_LABELS, TeamLabel, TitleMasterInfo } from '@/lib/sales/title-master-data';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu, Search, ChevronDown } from 'lucide-react';

const fmtComma = (n: number) => n.toLocaleString();

function getRsRate(workName: string): number {
  if (workName === '외모지상주의') return 0.7;
  if (workName === '이섭의 연애') return 0.5;
  return 0.6;
}

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

function fmtColumnHeader(date: string, mode: AggMode): { top?: string; main: string; isWeekend?: 'sat' | 'sun' | false } {
  if (mode === 'yearly') return { main: `${date}년` };
  if (mode === 'quarterly') {
    const [y, q] = date.split('-Q');
    return { top: y, main: `${q}분기` };
  }
  if (mode === 'monthly') {
    const m = parseInt(date.slice(5, 7), 10);
    return { top: date.slice(0, 4), main: `${m}월` };
  }
  if (mode === 'weekly') {
    const mon = new Date(date);
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return { main: `${mon.getMonth() + 1}/${mon.getDate()}~${sun.getMonth() + 1}/${sun.getDate()}` };
  }
  const d = new Date(date);
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const isWeekend = d.getDay() === 6 ? 'sat' as const : d.getDay() === 0 ? 'sun' as const : false as const;
  return { top: date.slice(5), main: dayName, isWeekend };
}

function compareLabel(mode: AggMode): string {
  switch (mode) {
    case 'daily': return '전일 대비';
    case 'weekly': return '전주 대비';
    case 'monthly': return '전월 대비';
    case 'quarterly': return '전분기 대비';
    case 'yearly': return '전년도 대비';
  }
}

function ChangeCell({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <span className="text-zinc-300 dark:text-zinc-600">-</span>;
  }
  if (previous === 0) {
    return <span className="text-emerald-600 dark:text-emerald-400 font-semibold">NEW</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) {
    return <span className="text-zinc-400">0%</span>;
  }
  if (pct > 0) {
    return <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{pct.toFixed(1)}%</span>;
  }
  return <span className="text-red-500 dark:text-red-400 font-semibold">{pct.toFixed(1)}%</span>;
}

function getSubLabels(mode: AggMode): string[] {
  return ['네이버 매출', '수수료', '더그림 매출', compareLabel(mode)];
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
  const [hiddenWorks, setHiddenWorks] = useState<Set<string>>(new Set());
  const [workFilterOpen, setWorkFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState<{ date: string; dir: 'asc' | 'desc' } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!workFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setWorkFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [workFilterOpen]);

  const [titles, setTitles] = useState<TitleMasterInfo[]>([]);
  useEffect(() => { fetchAllTitlesFromDB().then(setTitles).catch(() => {}); }, []);
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
      .then((d: DailySalesData) => setData(normalizeSalesData(d)))
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
        const feeByDate: Record<string, number> = {};
        let total = 0;
        let totalFee = 0;
        for (const r of salesRows) {
          byDate[r.date] = (byDate[r.date] || 0) + r.amount;
          const rowFee = (r as any).marketFee || 0;
          feeByDate[r.date] = (feeByDate[r.date] || 0) + rowFee;
          total += r.amount;
          totalFee += rowFee;
        }
        const titleInfo = titleMap.get(name);
        const fee = Math.round(totalFee);
        const rsRate = getRsRate(name);
        const grimSales = Math.round((total - fee) * rsRate);
        return { name, byDate, feeByDate, total, titleInfo, fee, grimSales, rsRate };
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
      .sort((a, b) => b.grimSales - a.grimSales);
  }, [agg, titleMap, statusFilter, labelFilter, search]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter(r => !hiddenWorks.has(r.name));
    if (sortBy) {
      return [...filtered].sort((a, b) => {
        const aVal = a.byDate[sortBy.date] || 0;
        const bVal = b.byDate[sortBy.date] || 0;
        return sortBy.dir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    return filtered;
  }, [rows, hiddenWorks, sortBy]);

  const toggleWorkVisibility = (name: string) => {
    setHiddenWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const dateMetrics = useMemo(() => {
    const m: Record<string, { naver: number; fee: number; grim: number }> = {};
    for (const date of dates) {
      m[date] = { naver: 0, fee: 0, grim: 0 };
      for (const row of visibleRows) {
        const amount = row.byDate[date] || 0;
        const fee = Math.round(row.feeByDate[date] || 0);
        m[date].naver += amount;
        m[date].fee += fee;
        m[date].grim += Math.round((amount - fee) * row.rsRate);
      }
    }
    return m;
  }, [visibleRows, dates]);

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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">작품별 매출 확인하기</h1>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-white/60 dark:bg-white/10 backdrop-blur-sm border border-black/[0.12] dark:border-white/[0.12] flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white/80 dark:hover:bg-white/15 transition-all duration-200"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 z-10" />
            <input
              type="text"
              placeholder="작품명, 작가, 장르 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-black/[0.12] dark:border-white/[0.12] bg-white/60 dark:bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom || defaultRange.from} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-2 text-sm rounded-xl border border-black/[0.12] dark:border-white/[0.12] bg-white/60 dark:bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            <span className="text-zinc-400 text-sm">~</span>
            <input type="date" value={customTo || defaultRange.to} onChange={e => setCustomTo(e.target.value)} className="px-3 py-2 text-sm rounded-xl border border-black/[0.12] dark:border-white/[0.12] bg-white/60 dark:bg-white/5 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            {(customFrom || customTo) && (
              <button onClick={() => { setCustomFrom(''); setCustomTo(''); }} className="px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">초기화</button>
            )}
          </div>
          <div className="flex bg-black/[0.06] dark:bg-white/[0.08] backdrop-blur-sm rounded-xl p-0.5 w-fit">
            {PERIOD_MODES.map(p => (
              <button
                key={p.mode}
                onClick={() => { setAggMode(p.mode); setSortBy(null); }}
                className={`px-3.5 py-2 text-sm font-medium rounded-[10px] transition-all duration-200 ${
                  aggMode === p.mode
                    ? 'bg-white/80 dark:bg-white/15 shadow-sm backdrop-blur-sm text-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1 font-medium">상태</span>
          {([
            { value: 'all' as const, label: '전체' },
            { value: '연재중' as const, label: '연재중' },
            { value: '완결' as const, label: '완결' },
            { value: '휴재' as const, label: '휴재' },
            { value: '준비중' as const, label: '준비중' },
          ]).map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${statusFilter === f.value ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white/60 dark:bg-white/5 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 border-black/[0.12] dark:border-white/[0.12] hover:border-zinc-400 dark:hover:border-zinc-500'}`}>
              {f.label} <span className="ml-1 tabular-nums">{statusCounts[f.value] ?? 0}</span>
            </button>
          ))}
          <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1 font-medium">레이블</span>
          {([
            { value: 'all' as const, label: '전체' },
            ...TEAM_LABELS.map(l => ({ value: l, label: l })),
          ]).map(f => (
            <button key={f.value} onClick={() => setLabelFilter(f.value)}
              className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-all duration-200 ${labelFilter === f.value ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100' : 'bg-white/60 dark:bg-white/5 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 border-black/[0.12] dark:border-white/[0.12] hover:border-zinc-400 dark:hover:border-zinc-500'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : !data || rows.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">
          {search || statusFilter !== 'all' || labelFilter !== 'all' ? '검색 결과가 없습니다' : '데이터 없음'}
        </div>
      ) : (
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-lg shadow-black/[0.03] overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-20">
                {/* Row 1: 기간 그룹 헤더 */}
                <tr className="bg-zinc-900 dark:bg-zinc-950">
                  <th rowSpan={2} className="sticky left-0 z-30 bg-zinc-900 dark:bg-zinc-950 text-left py-2.5 px-4 font-semibold text-white min-w-44 align-middle border-r border-zinc-700">
                    <div className="relative" ref={filterRef}>
                      <button
                        onClick={() => setWorkFilterOpen(v => !v)}
                        className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors"
                      >
                        작품
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${workFilterOpen ? 'rotate-180' : ''}`} />
                        {hiddenWorks.size > 0 && (
                          <span className="text-[10px] bg-cyan-500 text-white rounded-full px-1.5 py-0.5 leading-none">{rows.length - hiddenWorks.size}/{rows.length}</span>
                        )}
                      </button>
                      {workFilterOpen && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-xl rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/60 dark:border-white/10 z-50 overflow-hidden"
                          onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-700">
                            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">작품 필터</span>
                            <div className="flex gap-2">
                              <button onClick={() => setHiddenWorks(new Set())} className="text-[11px] text-cyan-500 hover:text-cyan-400 font-medium">전체 선택</button>
                              <button onClick={() => setHiddenWorks(new Set(rows.map(r => r.name)))} className="text-[11px] text-zinc-400 hover:text-zinc-300 font-medium">전체 해제</button>
                            </div>
                          </div>
                          <div className="max-h-64 overflow-y-auto py-1">
                            {rows.map(r => (
                              <label key={r.name} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  checked={!hiddenWorks.has(r.name)}
                                  onChange={() => toggleWorkVisibility(r.name)}
                                  className="rounded border-zinc-300 dark:border-zinc-600 text-cyan-500 focus:ring-cyan-500 h-3.5 w-3.5"
                                />
                                <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{r.name}</span>
                                <span className="ml-auto text-[10px] text-zinc-400 tabular-nums">{fmtComma(r.grimSales)}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </th>
                  {dates.map(date => {
                    const h = fmtColumnHeader(date, aggMode);
                    const isSorted = sortBy?.date === date;
                    return (
                      <th key={date} colSpan={4}
                        className="text-center py-2.5 px-1 font-bold text-sm border-l-2 border-zinc-500 align-middle cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-900 transition-colors select-none"
                        onClick={() => {
                          if (!isSorted) setSortBy({ date, dir: 'desc' });
                          else if (sortBy.dir === 'desc') setSortBy({ date, dir: 'asc' });
                          else setSortBy(null);
                        }}
                      >
                        {h.top && <span className="text-zinc-400 text-xs mr-1">{h.top}</span>}
                        <span className={h.isWeekend === 'sat' ? 'text-blue-400' : h.isWeekend === 'sun' ? 'text-red-400' : 'text-white'}>{h.main}</span>
                        {isSorted && <span className="ml-1 text-cyan-400 text-xs">{sortBy.dir === 'desc' ? '▼' : '▲'}</span>}
                      </th>
                    );
                  })}
                </tr>
                {/* Row 2: 서브 컬럼 라벨 */}
                <tr className="bg-zinc-800 dark:bg-zinc-900">
                  {dates.map(date => {
                    const subLabels = getSubLabels(aggMode);
                    return (
                      <Fragment key={date}>
                        {subLabels.map((label, li) => (
                          <th key={`${date}-${label}`} className={`text-center py-2 px-2 text-xs font-semibold text-white whitespace-nowrap ${li === 0 ? 'border-l-2 border-zinc-500' : ''}`}>
                            {label}
                          </th>
                        ))}
                      </Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => {
                  const slug = getSlugByWorkName(row.name);
                  return (
                    <tr key={row.name} className="border-t border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors duration-150">
                      <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 py-2.5 px-4 truncate max-w-56 border-r border-zinc-100 dark:border-zinc-800">
                        <span className={`inline-block w-5 text-right mr-2 tabular-nums text-sm ${i === 0 ? 'text-amber-500 font-bold' : i < 3 ? 'text-zinc-400 font-semibold' : 'text-zinc-300 dark:text-zinc-600'}`}>{i + 1}</span>
                        {slug ? (
                          <Link href={`/accounting/sales/master/${slug}`} className="font-bold text-zinc-900 dark:text-zinc-100 hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors">{row.name}</Link>
                        ) : (
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">{row.name}</span>
                        )}
                      </td>
                      {dates.map((date, dateIdx) => {
                        const amount = row.byDate[date] || 0;
                        const prevDateKey = dateIdx > 0 ? dates[dateIdx - 1] : null;
                        const prevAmount = prevDateKey ? (row.byDate[prevDateKey] || 0) : 0;
                        const cellFee = Math.round(row.feeByDate[date] || 0);
                        const cellGrim = Math.round((amount - cellFee) * row.rsRate);
                        const empty = amount === 0;
                        return (
                          <Fragment key={date}>
                            <td className={`text-right py-2.5 px-2 tabular-nums border-l-2 border-zinc-200 dark:border-zinc-700 ${empty ? 'text-zinc-200 dark:text-zinc-700' : 'text-zinc-700 dark:text-zinc-300'}`}>
                              {empty ? '-' : fmtComma(amount)}
                            </td>
                            <td className={`text-right py-2.5 px-2 tabular-nums ${empty ? 'text-zinc-200 dark:text-zinc-700' : 'text-zinc-400 dark:text-zinc-500'}`}>
                              {empty ? '-' : fmtComma(cellFee)}
                            </td>
                            <td className={`text-right py-2.5 px-2 tabular-nums ${empty ? 'text-zinc-200 dark:text-zinc-700' : 'font-bold text-zinc-900 dark:text-zinc-100'}`}>
                              {empty ? '-' : fmtComma(cellGrim)}
                            </td>
                            <td className={`text-right py-2.5 px-2 tabular-nums text-sm ${empty ? 'text-zinc-200 dark:text-zinc-700' : ''}`}>
                              {empty ? '-' : <ChangeCell current={amount} previous={prevAmount} />}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                  <td className="sticky left-0 z-10 bg-zinc-50 dark:bg-zinc-800 py-2.5 px-4 font-bold text-zinc-700 dark:text-zinc-200 border-r border-zinc-200 dark:border-zinc-700">
                    합계
                  </td>
                  {dates.map((date, dateIdx) => {
                    const dm = dateMetrics[date];
                    const prevDateKey = dateIdx > 0 ? dates[dateIdx - 1] : null;
                    const prevNaver = prevDateKey ? (dateMetrics[prevDateKey]?.naver || 0) : 0;
                    return (
                      <Fragment key={date}>
                        <td className="text-right py-2.5 px-2 tabular-nums font-bold text-zinc-700 dark:text-zinc-200 border-l-2 border-zinc-200 dark:border-zinc-700">
                          {fmtComma(dm?.naver || 0)}
                        </td>
                        <td className="text-right py-2.5 px-2 tabular-nums text-zinc-400 dark:text-zinc-500">
                          {fmtComma(dm?.fee || 0)}
                        </td>
                        <td className="text-right py-2.5 px-2 tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                          {fmtComma(dm?.grim || 0)}
                        </td>
                        <td className="text-right py-2.5 px-2 tabular-nums text-sm font-semibold">
                          <ChangeCell current={dm?.naver || 0} previous={prevNaver} />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
