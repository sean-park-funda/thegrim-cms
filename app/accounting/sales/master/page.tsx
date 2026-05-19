'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { TITLE_MASTER_DATA, GLOBAL_COUNTRIES, TitleMasterInfo } from '@/lib/sales/title-master-data';
import {
  Search,
  BookOpen,
  Crown,
  Calendar,
  Hash,
  ChevronRight,
} from 'lucide-react';

type StatusFilter = 'all' | '연재중' | '완결' | '휴재';

const STATUS_COLORS: Record<string, string> = {
  '연재중': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '완결': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  '휴재': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '미진출': 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500',
  '계약중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '준비중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

function TitleCard({ title }: { title: TitleMasterInfo }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const thumb = localStorage.getItem(`title-thumb-${title.slug}`);
      if (thumb) setThumbUrl(thumb);
    } catch {}
  }, [title.slug]);

  const writer = title.creators.find((c) => c.role === '글')?.name;
  const artist = title.creators.find((c) => c.role === '그림')?.name;
  const creatorStr =
    writer && artist && writer !== artist
      ? `${writer} / ${artist}`
      : writer || artist || '-';

  return (
    <Link
      href={`/accounting/sales/master/${title.slug}`}
      className="group rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden hover:shadow-lg dark:hover:border-zinc-600 transition-all duration-200"
    >
      <div className="flex">
        {/* 썸네일 */}
        <div className="w-24 min-h-[140px] bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
          {thumbUrl ? (
            <img src={thumbUrl} alt={title.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300 dark:text-zinc-600">
              <BookOpen className="h-6 w-6" />
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                    {title.title}
                  </h3>
                  <span
                    className={`flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                      STATUS_COLORS[title.status] || STATUS_COLORS['완결']
                    }`}
                  >
                    {title.status}
                  </span>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  {creatorStr}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-zinc-300 dark:text-zinc-600 group-hover:text-cyan-500 dark:group-hover:text-cyan-400 transition-colors flex-shrink-0 mt-1" />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {title.platform}
              </span>
              {title.dayOfWeek && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {title.dayOfWeek}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {title.episodeCount}화
              </span>
              <span>{title.ageRating}</span>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">
                {title.mainGenre}
              </span>
              {title.subGenre && (
                <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-[10px] font-semibold">
                  {title.subGenre}
                </span>
              )}
              {title.keywords.slice(0, 3).map((kw) => (
                <span
                  key={kw}
                  className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px]"
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>

          <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>
              {title.startDate} ~ {title.endDate || '연재중'}
            </span>
            {title.nonExclusiveDate && (
              <span className="text-amber-500 dark:text-amber-400">
                비독점 {title.nonExclusiveDate}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function MasterBoardPage() {
  const { profile } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    return TITLE_MASTER_DATA.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          t.title.toLowerCase().includes(q) ||
          t.creators.some((c) => c.name.toLowerCase().includes(q)) ||
          t.mainGenre.toLowerCase().includes(q) ||
          t.subGenre?.toLowerCase().includes(q) ||
          t.keywords.some((k) => k.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [search, statusFilter]);

  if (!profile || !canViewSales(profile.role)) return null;

  const statCounts = {
    total: TITLE_MASTER_DATA.length,
    active: TITLE_MASTER_DATA.filter((t) => t.status === '연재중').length,
    completed: TITLE_MASTER_DATA.filter((t) => t.status === '완결').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-orange-500/20">
          <Crown className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">작품 관리 보드</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            보유 작품의 종합 정보를 관리합니다
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="작품명, 작가, 장르, 키워드로 검색..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
          />
        </div>
        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-xl p-0.5 w-fit">
          {(
            [
              { value: 'all', label: '전체' },
              { value: '연재중', label: '연재중' },
              { value: '완결', label: '완결' },
            ] as const
          ).map((f) => (
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

      <div className="flex gap-4 text-sm text-zinc-500 dark:text-zinc-400">
        <span>
          전체{' '}
          <strong className="text-zinc-700 dark:text-zinc-200">{statCounts.total}</strong>
          작품
        </span>
        <span>
          연재중{' '}
          <strong className="text-green-600 dark:text-green-400">{statCounts.active}</strong>
        </span>
        <span>
          완결 <strong className="text-zinc-500">{statCounts.completed}</strong>
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
          {search || statusFilter !== 'all'
            ? '검색 결과가 없습니다'
            : '등록된 작품이 없습니다'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((title) => (
            <TitleCard key={title.slug} title={title} />
          ))}
        </div>
      )}
    </div>
  );
}
