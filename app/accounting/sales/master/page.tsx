'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import {
  TitleMasterInfo,
  TEAM_LABELS,
  TeamLabel,
  TitleStatus,
  SerialType,
  DayOfWeek,
  getAllTitles,
  addCustomTitle,
  TitleCreator,
} from '@/lib/sales/title-master-data';
import {
  Search,
  BookOpen,
  Calendar,
  Hash,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';

type StatusFilter = 'all' | '연재중' | '완결' | '휴재' | '준비중';

const STATUS_COLORS: Record<string, string> = {
  '연재중': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '완결': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  '휴재': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '미진출': 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500',
  '계약중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '준비중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const STATUS_OPTIONS: TitleStatus[] = ['연재중', '완결', '휴재', '준비중'];
const SERIAL_TYPE_OPTIONS: SerialType[] = ['요일웹툰', '매일+', '기타'];
const DAY_OPTIONS: DayOfWeek[] = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

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
      <div className="flex h-44">
        <div className="w-28 bg-zinc-100 dark:bg-zinc-800 flex-shrink-0">
          {thumbUrl ? (
            <img src={thumbUrl} alt={title.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300 dark:text-zinc-600">
              <BookOpen className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="p-4 flex-1">
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

          <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500 mt-auto">
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

function AddTitleModal({ onClose, onAdd }: { onClose: () => void; onAdd: (t: TitleMasterInfo) => void }) {
  const [title, setTitle] = useState('');
  const [writer, setWriter] = useState('');
  const [artist, setArtist] = useState('');
  const [status, setStatus] = useState<TitleStatus>('연재중');
  const [platform, setPlatform] = useState('네이버웹툰');
  const [teamLabel, setTeamLabel] = useState<TeamLabel | ''>('');
  const [serialType, setSerialType] = useState<SerialType>('요일웹툰');
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek | ''>('');
  const [mainGenre, setMainGenre] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    const creators: TitleCreator[] = [];
    if (writer.trim()) creators.push({ role: '글', name: writer.trim() });
    if (artist.trim()) creators.push({ role: '그림', name: artist.trim() });
    if (creators.length === 0) creators.push({ role: '글', name: '-' });

    const newTitle = addCustomTitle({
      title: title.trim(),
      creators,
      status,
      platform,
      teamLabel: teamLabel || undefined,
      serialType,
      dayOfWeek: dayOfWeek || undefined,
      mainGenre: mainGenre.trim() || '기타',
    });
    onAdd(newTitle);
  };

  const inputClass = 'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500';
  const selectClass = inputClass;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl dark:border dark:border-zinc-800 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold">작품 등록</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">작품명 *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="작품명을 입력하세요" className={inputClass} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">글 작가</label>
              <input type="text" value={writer} onChange={(e) => setWriter(e.target.value)} placeholder="작가명" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">그림 작가</label>
              <input type="text" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="작가명" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">상태</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TitleStatus)} className={selectClass}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">레이블</label>
              <select value={teamLabel} onChange={(e) => setTeamLabel(e.target.value as TeamLabel | '')} className={selectClass}>
                <option value="">선택 안 함</option>
                {TEAM_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">플랫폼</label>
              <input type="text" value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">연재방식</label>
              <select value={serialType} onChange={(e) => setSerialType(e.target.value as SerialType)} className={selectClass}>
                {SERIAL_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">요일</label>
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value as DayOfWeek | '')} className={selectClass}>
                <option value="">선택 안 함</option>
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 block">주장르</label>
            <input type="text" value={mainGenre} onChange={(e) => setMainGenre(e.target.value)} placeholder="드라마, 액션, 로맨스..." className={inputClass} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MasterBoardPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [labelFilter, setLabelFilter] = useState<TeamLabel | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [titles, setTitles] = useState<TitleMasterInfo[]>([]);

  useEffect(() => {
    setTitles(getAllTitles());
  }, []);

  const filtered = useMemo(() => {
    return titles.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (labelFilter !== 'all' && t.teamLabel !== labelFilter) return false;
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
  }, [titles, search, statusFilter, labelFilter]);

  if (!profile || !canViewSales(profile.role)) return null;

  const statusOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: '전체', count: titles.length },
    { value: '연재중', label: '연재중', count: titles.filter((t) => t.status === '연재중').length },
    { value: '완결', label: '완결', count: titles.filter((t) => t.status === '완결').length },
    { value: '준비중', label: '준비중', count: titles.filter((t) => t.status === '준비중').length },
    { value: '휴재', label: '휴재', count: titles.filter((t) => t.status === '휴재').length },
  ];

  const handleAdd = (newTitle: TitleMasterInfo) => {
    setShowAddModal(false);
    setTitles(getAllTitles());
    router.push(`/accounting/sales/master/${newTitle.slug}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">작품 관리 보드</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          작품 등록
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="작품명, 작가, 장르, 키워드로 검색..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">상태</span>
          {statusOptions.filter((f) => f.value === 'all' || f.count > 0).map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
                statusFilter === f.value
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              {f.label} <span className="ml-1 tabular-nums">{f.count}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mr-1">레이블</span>
          {([
            { value: 'all' as const, label: '전체' },
            ...TEAM_LABELS.map((l) => ({ value: l, label: l })),
          ]).map((f) => (
            <button
              key={f.value}
              onClick={() => setLabelFilter(f.value)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all duration-200 ${
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

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
          {search || statusFilter !== 'all' || labelFilter !== 'all'
            ? '검색 결과가 없습니다'
            : '등록된 작품이 없습니다'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((title) => (
            <TitleCard key={title.slug} title={title} />
          ))}
        </div>
      )}

      {showAddModal && <AddTitleModal onClose={() => setShowAddModal(false)} onAdd={handleAdd} />}
    </div>
  );
}
