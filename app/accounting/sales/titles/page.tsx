'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { fmtShort } from '@/lib/sales/types';
import { Search, BookOpen, Globe, Film, Filter } from 'lucide-react';

interface WorkInfo {
  id: string;
  name: string;
  naver_name: string | null;
  is_active: boolean;
  label: string | null;
  platform: string | null;
  serial_start_date: string | null;
  serial_end_date: string | null;
  episode_count: number | null;
  genre: string[] | null;
  logline: string | null;
  thumbnail_url: string | null;
}

interface WorkCard {
  work: WorkInfo;
  partners: { partner: { name: string; pen_name: string | null } | null; rs_rate: number }[];
  globalLaunchCount: number;
  secondaryBizCount: number;
  totalSales: number;
}

type StatusFilter = 'all' | 'active' | 'completed';

export default function TitlesPage() {
  const { profile } = useStore();
  const [works, setWorks] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!profile || !canViewSales(profile.role)) return;

    const load = async () => {
      try {
        const salesRes = await settlementFetch('/api/accounting/sales?from=2020-01-01&to=2030-12-31');
        const salesData = await salesRes.json();
        const { workIdMap, summary } = salesData;

        const salesTotals: Record<string, number> = {};
        for (const wt of summary.workTotals || []) {
          salesTotals[wt.name] = wt.total;
        }

        const uniqueIds = [...new Set(Object.values(workIdMap))] as string[];

        const details = await Promise.all(
          uniqueIds.map(id =>
            settlementFetch(`/api/accounting/sales/works/${id}?from=2020-01-01&to=2030-12-31`)
              .then(r => r.json())
              .catch(() => null)
          )
        );

        const cards: WorkCard[] = [];
        for (const d of details) {
          if (!d || !d.work) continue;
          const workName = d.work.name || d.work.naver_name;
          cards.push({
            work: d.work,
            partners: d.partners || [],
            globalLaunchCount: d.globalLaunches?.length || 0,
            secondaryBizCount: d.secondaryBiz?.length || 0,
            totalSales: salesTotals[workName] || d.summary?.totalSales || 0,
          });
        }

        cards.sort((a, b) => b.totalSales - a.totalSales);
        setWorks(cards);
      } catch (e) {
        console.error('작품 목록 로딩 오류:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [profile]);

  const filtered = useMemo(() => {
    return works.filter(w => {
      if (statusFilter === 'active' && !w.work.is_active) return false;
      if (statusFilter === 'completed' && w.work.is_active) return false;
      if (search) {
        const q = search.toLowerCase();
        const nameMatch = w.work.name?.toLowerCase().includes(q);
        const naverMatch = w.work.naver_name?.toLowerCase().includes(q);
        const authorMatch = w.partners.some(p =>
          p.partner?.pen_name?.toLowerCase().includes(q) ||
          p.partner?.name?.toLowerCase().includes(q)
        );
        const genreMatch = w.work.genre?.some(g => g.toLowerCase().includes(q));
        if (!nameMatch && !naverMatch && !authorMatch && !genreMatch) return false;
      }
      return true;
    });
  }, [works, search, statusFilter]);

  if (!profile || !canViewSales(profile.role)) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">작품 정보 관리</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          보유 작품의 상세 정보를 확인하고 관리합니다
        </p>
      </div>

      {/* 검색 & 필터 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="작품명, 작가, 장르로 검색..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
          />
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 w-fit">
          {([
            { value: 'all', label: '전체' },
            { value: 'active', label: '연재중' },
            { value: 'completed', label: '완결' },
          ] as const).map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-[10px] transition-all duration-200 ${
                statusFilter === f.value
                  ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 통계 */}
      {!loading && (
        <div className="flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <span>전체 <strong className="text-zinc-700 dark:text-zinc-200">{works.length}</strong>작품</span>
          <span>연재중 <strong className="text-green-600 dark:text-green-400">{works.filter(w => w.work.is_active).length}</strong></span>
          <span>완결 <strong className="text-zinc-500">{works.filter(w => !w.work.is_active).length}</strong></span>
        </div>
      )}

      {/* 작품 목록 */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">작품 정보를 불러오는 중...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
          {search || statusFilter !== 'all' ? '검색 결과가 없습니다' : '작품이 없습니다'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(card => (
            <Link
              key={card.work.id}
              href={`/accounting/sales/titles/${card.work.id}`}
              className="group rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden hover:shadow-md dark:hover:border-zinc-700 transition-all duration-200"
            >
              <div className="p-4 flex gap-4">
                {/* 썸네일 */}
                <div className="w-16 h-20 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                  {card.work.thumbnail_url ? (
                    <img
                      src={card.work.thumbnail_url}
                      alt={card.work.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-zinc-300 dark:text-zinc-600" />
                    </div>
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                      {card.work.name}
                    </h3>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      card.work.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {card.work.is_active ? '연재중' : '완결'}
                    </span>
                  </div>

                  {/* 작가 */}
                  {card.partners.length > 0 && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                      {card.partners.map(p => p.partner?.pen_name || p.partner?.name).filter(Boolean).join(', ')}
                    </p>
                  )}

                  {/* 태그들 */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {card.work.platform && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-medium">
                        {card.work.platform}
                      </span>
                    )}
                    {card.work.label && (
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-[10px] font-medium">
                        {card.work.label}
                      </span>
                    )}
                    {card.work.genre?.slice(0, 2).map(g => (
                      <span key={g} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px]">
                        {g}
                      </span>
                    ))}
                    {(card.work.genre?.length || 0) > 2 && (
                      <span className="px-1.5 py-0.5 text-zinc-400 text-[10px]">
                        +{(card.work.genre?.length || 0) - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 하단 정보 */}
              <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
                <div className="flex gap-3">
                  {card.work.episode_count && (
                    <span>{card.work.episode_count}화</span>
                  )}
                  {card.globalLaunchCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Globe className="h-3 w-3" />
                      {card.globalLaunchCount}개국
                    </span>
                  )}
                  {card.secondaryBizCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Film className="h-3 w-3" />
                      2차 {card.secondaryBizCount}건
                    </span>
                  )}
                </div>
                {card.totalSales > 0 && (
                  <span className="font-medium text-zinc-500 dark:text-zinc-400">
                    {fmtShort(card.totalSales)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
