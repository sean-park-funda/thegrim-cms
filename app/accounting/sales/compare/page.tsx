'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { PRESETS, fmtShort, fmtWon, getDateRange } from '@/lib/sales/types';
import { Plus, X, BarChart3 } from 'lucide-react';

const COLORS = [
  { bg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400', light: 'bg-blue-500/20' },
  { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', light: 'bg-emerald-500/20' },
  { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', light: 'bg-amber-500/20' },
  { bg: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400', light: 'bg-purple-500/20' },
  { bg: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400', light: 'bg-rose-500/20' },
];

interface WorkOption {
  id: string;
  name: string;
}

interface CompareWork {
  id: string;
  name: string;
  dailySales: { date: string; amount: number }[];
  total: number;
}

export default function ComparePage() {
  const { profile } = useStore();
  const [days, setDays] = useState(30);
  const [allWorks, setAllWorks] = useState<WorkOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<CompareWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  // 작품 목록 로드
  useEffect(() => {
    if (!profile || !canViewSales(profile.role)) return;
    settlementFetch('/api/accounting/settlement/works')
      .then(r => r.json())
      .then(d => {
        const works = (d.works || [])
          .filter((w: { is_active: boolean }) => w.is_active)
          .map((w: { id: string; name: string }) => ({ id: w.id, name: w.name }))
          .sort((a: WorkOption, b: WorkOption) => a.name.localeCompare(b.name));
        setAllWorks(works);
      })
      .catch(console.error);
  }, [profile]);

  // 비교 데이터 로드
  useEffect(() => {
    if (selectedIds.length === 0) {
      setCompareData([]);
      return;
    }
    setLoading(true);
    settlementFetch(`/api/accounting/sales/compare?workIds=${selectedIds.join(',')}&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => setCompareData(d.works || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedIds, from, to]);

  if (!profile || !canViewSales(profile.role)) return null;

  // 모든 날짜 수집
  const allDates = useMemo(() => {
    const dateSet = new Set<string>();
    for (const w of compareData) {
      for (const d of w.dailySales) dateSet.add(d.date);
    }
    return [...dateSet].sort();
  }, [compareData]);

  // 최대값 (차트 스케일)
  const maxAmount = useMemo(() => {
    let max = 1;
    for (const w of compareData) {
      for (const d of w.dailySales) {
        if (d.amount > max) max = d.amount;
      }
    }
    return max;
  }, [compareData]);

  const filteredWorks = allWorks.filter(
    w => !selectedIds.includes(w.id) && w.name.toLowerCase().includes(searchQ.toLowerCase())
  );

  const addWork = (id: string) => {
    if (selectedIds.length >= 5) return;
    setSelectedIds(prev => [...prev, id]);
    setShowPicker(false);
    setSearchQ('');
  };

  const removeWork = (id: string) => {
    setSelectedIds(prev => prev.filter(x => x !== id));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">작품 비교</h1>

      {/* 기간 선택 */}
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

      {/* 작품 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        {selectedIds.map((id, i) => {
          const w = compareData.find(x => x.id === id) || allWorks.find(x => x.id === id);
          const color = COLORS[i % COLORS.length];
          return (
            <span
              key={id}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${color.light} ${color.text}`}
            >
              <span className={`w-2 h-2 rounded-full ${color.bg}`} />
              {w?.name || id}
              <button onClick={() => removeWork(id)} className="ml-0.5 hover:opacity-70">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
        {selectedIds.length < 5 && (
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              작품 추가
            </button>
            {showPicker && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-900 rounded-xl shadow-lg dark:shadow-none dark:border dark:border-zinc-800 z-50 overflow-hidden">
                <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                  <input
                    type="text"
                    placeholder="작품 검색..."
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm rounded-lg bg-zinc-50 dark:bg-zinc-800 border-0 focus:ring-1 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {filteredWorks.length === 0 ? (
                    <div className="p-3 text-sm text-zinc-400 text-center">결과 없음</div>
                  ) : (
                    filteredWorks.map(w => (
                      <button
                        key={w.id}
                        onClick={() => addWork(w.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {w.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-2">
          <BarChart3 className="h-8 w-8" />
          <p className="text-sm">비교할 작품을 선택하세요 (최대 5개)</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {compareData.map((w, i) => {
              const color = COLORS[i % COLORS.length];
              return (
                <div key={w.id} className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
                  <div className={`text-xs ${color.text} font-medium mb-1 flex items-center gap-1.5`}>
                    <span className={`w-2 h-2 rounded-full ${color.bg}`} />
                    {w.name}
                  </div>
                  <div className="text-xl font-bold tracking-tight">{fmtShort(w.total)}</div>
                </div>
              );
            })}
          </div>

          {/* 일별 비교 차트 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">일별 매출 비교</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              {allDates.map(date => {
                const dateObj = new Date(date);
                const dayName = ['일','월','화','수','목','금','토'][dateObj.getDay()];
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                return (
                  <div key={date}>
                    <div className={`text-xs tabular-nums mb-0.5 ${isWeekend ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                      {date.slice(5)} {dayName}
                    </div>
                    <div className="space-y-0.5">
                      {compareData.map((w, i) => {
                        const entry = w.dailySales.find(d => d.date === date);
                        const amount = entry?.amount || 0;
                        const pct = (amount / maxAmount) * 100;
                        const color = COLORS[i % COLORS.length];
                        return (
                          <div key={w.id} className="flex items-center gap-2 text-xs">
                            <div className="flex-1 h-4 bg-zinc-50 dark:bg-zinc-800/50 rounded overflow-hidden">
                              <div
                                className={`h-full ${color.bg} rounded opacity-70`}
                                style={{ width: `${Math.max(pct, 0.3)}%` }}
                              />
                            </div>
                            <span className="w-20 text-right tabular-nums font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                              {amount > 0 ? amount.toLocaleString() : '-'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 월별 비교 테이블 */}
          {(() => {
            // 월별 집계
            const monthlyByWork: Record<string, Record<string, number>> = {};
            const allMonths = new Set<string>();
            for (const w of compareData) {
              monthlyByWork[w.id] = {};
              for (const d of w.dailySales) {
                const month = d.date.slice(0, 7);
                allMonths.add(month);
                monthlyByWork[w.id][month] = (monthlyByWork[w.id][month] || 0) + d.amount;
              }
            }
            const months = [...allMonths].sort();
            if (months.length === 0) return null;

            return (
              <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">월별 비교</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                        <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">월</th>
                        {compareData.map((w, i) => (
                          <th key={w.id} className={`text-right py-2.5 px-5 font-medium ${COLORS[i % COLORS.length].text}`}>
                            {w.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {months.map(month => (
                        <tr key={month} className="border-t border-zinc-100 dark:border-zinc-800/50">
                          <td className="py-2.5 px-5">{month}</td>
                          {compareData.map(w => (
                            <td key={w.id} className="py-2.5 px-5 text-right tabular-nums font-medium">
                              {monthlyByWork[w.id]?.[month] ? fmtWon(monthlyByWork[w.id][month]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                        <td className="py-2.5 px-5 font-bold">합계</td>
                        {compareData.map(w => (
                          <td key={w.id} className="py-2.5 px-5 text-right tabular-nums font-bold">
                            {fmtWon(w.total)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
