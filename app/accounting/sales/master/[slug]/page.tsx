'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import {
  getTitleBySlug,
  getAllTitleBySlug,
  GLOBAL_COUNTRIES,
  TitleMasterInfo,
  TitleCreator,
  CountryPublishing,
  GlobalCountryCode,
  SecondaryBizItem,
  SecondaryBizCategory,
  TitleStatus,
  SerialType,
  DayOfWeek,
  TeamLabel,
  TEAM_LABELS,
  deleteTitle,
} from '@/lib/sales/title-master-data';
import {
  ArrowLeft,
  BookOpen,
  Globe,
  Clapperboard,
  ScrollText,
  Pencil,
  Plus,
  Trash2,
  ImagePlus,
  ExternalLink,
} from 'lucide-react';

const STATUS_OPTIONS: TitleStatus[] = ['연재중', '휴재', '완결', '준비중'];
const SERIAL_TYPE_OPTIONS: SerialType[] = ['요일웹툰', '매일+', '기타'];
const DAY_OPTIONS: DayOfWeek[] = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
const CREATOR_ROLES: TitleCreator['role'][] = ['글', '그림', '원작', '컬러', '각색', '기타'];
const BIZ_CATEGORIES: SecondaryBizCategory[] = ['출판', '드라마', '영화', '애니메이션', '그 외'];
const COUNTRY_PUB_STATUS = ['연재중', '완결', '미진출', '계약중', '준비중'] as const;

const STATUS_COLORS: Record<string, string> = {
  '연재중': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '완결': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  '휴재': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '준비중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '미진출': 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500',
  '계약중': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

const ROLE_COLORS: Record<string, string> = {
  '글': 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  '그림': 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  '원작': 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  '컬러': 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  '각색': 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400',
  '기타': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

const BIZ_ICONS: Record<string, string> = {
  '출판': '📚', '드라마': '📺', '영화': '🎬', '애니메이션': '🎞️', '그 외': '📋',
};

function Section({ icon: Icon, title, children, accent, onEdit, editing }: {
  icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; accent?: string; onEdit?: () => void; editing?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent || 'text-zinc-400'}`} />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex-1">{title}</h2>
        {onEdit && !editing && (
          <button onClick={onEdit} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
        )}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-0.5 block">{children}</span>;
}

function FieldValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-sm font-medium ${className || ''}`}>{children || <span className="text-zinc-300 dark:text-zinc-600">-</span>}</div>;
}

function EditActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-3">
      <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">취소</button>
      <button onClick={onSave} className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors">저장</button>
    </div>
  );
}

function Input({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 ${className || 'w-full'}`} />
  );
}

function Select<T extends string>({ value, options, onChange, className }: { value: T; options: readonly T[]; onChange: (v: T) => void; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}
      className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 ${className || ''}`}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function MasterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { profile } = useStore();
  const titleData = getAllTitleBySlug(slug);
  const [data, setData] = useState<TitleMasterInfo | null>(titleData ? { ...titleData } : null);
  const [editingBasic, setEditingBasic] = useState(false);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [editingBiz, setEditingBiz] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<TitleMasterInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) return;
    try {
      const saved = localStorage.getItem(`title-master-${slug}`);
      const thumb = localStorage.getItem(`title-thumb-${slug}`);
      if (saved) {
        const parsed = JSON.parse(saved) as TitleMasterInfo;
        if (thumb) parsed.thumbnailUrl = thumb;
        setData(parsed);
      } else if (thumb && titleData) {
        setData({ ...titleData, thumbnailUrl: thumb });
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const saveToStorage = useCallback((newData: TitleMasterInfo) => {
    if (!slug) return;
    try {
      const { thumbnailUrl, ...rest } = newData;
      localStorage.setItem(`title-master-${slug}`, JSON.stringify(rest));
      if (thumbnailUrl) {
        localStorage.setItem(`title-thumb-${slug}`, thumbnailUrl);
      } else {
        localStorage.removeItem(`title-thumb-${slug}`);
      }
    } catch {}
  }, [slug]);

  const startEdit = useCallback((section: string) => {
    if (!data) return;
    setDraft({ ...data, creators: [...data.creators], keywords: [...data.keywords], secondaryBiz: [...data.secondaryBiz], globalInfo: { ...data.globalInfo } });
    if (section === 'basic') setEditingBasic(true);
    if (section === 'global') setEditingGlobal(true);
    if (section === 'biz') setEditingBiz(true);
    if (section === 'notes') setEditingNotes(true);
  }, [data]);

  const save = useCallback((section: string) => {
    if (!draft) return;
    const newData = { ...draft };
    setData(newData);
    saveToStorage(newData);
    if (section === 'basic') setEditingBasic(false);
    if (section === 'global') setEditingGlobal(false);
    if (section === 'biz') setEditingBiz(false);
    if (section === 'notes') setEditingNotes(false);
  }, [draft, saveToStorage]);

  const cancel = useCallback((section: string) => {
    if (section === 'basic') setEditingBasic(false);
    if (section === 'global') setEditingGlobal(false);
    if (section === 'biz') setEditingBiz(false);
    if (section === 'notes') setEditingNotes(false);
  }, []);

  const handleThumbnailUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 400;
        const w = Math.min(img.width, MAX_W);
        const h = img.height * (w / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.85);
        if (slug) {
          try { localStorage.setItem(`title-thumb-${slug}`, compressed); } catch {}
        }
        setData(prev => prev ? { ...prev, thumbnailUrl: compressed } : prev);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }, [slug]);

  if (!profile || !canViewSales(profile.role)) return null;
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-4">
        <span className="text-sm">작품을 찾을 수 없습니다</span>
        <Link href="/accounting/sales/master" className="text-sm text-cyan-600 hover:underline">목록으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1800px]">
      {/* ───── 기본 정보: 썸네일 + 정보 통합 ───── */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
          <Link href="/accounting/sales/master" className="h-7 w-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex-shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <BookOpen className="h-4 w-4 text-cyan-500" />
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex-1">기본 정보</h2>
          {!editingBasic && (
            <>
              <button onClick={() => startEdit('basic')} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => setShowDeleteConfirm(true)} className="text-zinc-400 hover:text-red-500 transition-colors ml-1"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>

        {editingBasic && draft ? (
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">작품명</label>
                    <Input value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">레이블</label>
                    <select value={draft.teamLabel || ''} onChange={(e) => setDraft({ ...draft, teamLabel: (e.target.value || undefined) as TeamLabel | undefined })}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                      <option value="">선택 안 함</option>
                      {TEAM_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">작품 링크 (URL)</label>
                  <Input value={draft.titleUrl || ''} onChange={(v) => setDraft({ ...draft, titleUrl: v || undefined })} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">작가 정보</label>
                <div className="space-y-2">
                  {draft.creators.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={c.role} onChange={(e) => { const nc = [...draft.creators]; nc[i] = { ...nc[i], role: e.target.value as TitleCreator['role'] }; setDraft({ ...draft, creators: nc }); }}
                        className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1.5 text-sm w-20">
                        {CREATOR_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <Input value={c.name} onChange={(v) => { const nc = [...draft.creators]; nc[i] = { ...nc[i], name: v }; setDraft({ ...draft, creators: nc }); }} className="flex-1" />
                      <button onClick={() => setDraft({ ...draft, creators: draft.creators.filter((_, j) => j !== i) })} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  <button onClick={() => setDraft({ ...draft, creators: [...draft.creators, { role: '기타', name: '' }] })} className="text-xs text-cyan-500 hover:text-cyan-600 flex items-center gap-1"><Plus className="h-3 w-3" /> 작가 추가</button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-xs text-zinc-400 mb-1 block">연령 등급</label><Input value={draft.ageRating} onChange={(v) => setDraft({ ...draft, ageRating: v })} /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">주장르</label><Input value={draft.mainGenre} onChange={(v) => setDraft({ ...draft, mainGenre: v })} /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">부장르</label><Input value={draft.subGenre || ''} onChange={(v) => setDraft({ ...draft, subGenre: v || undefined })} /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">에피소드 수</label><input type="number" value={draft.episodeCount} onChange={(e) => setDraft({ ...draft, episodeCount: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-xs text-zinc-400 mb-1 block">상태</label><Select value={draft.status} options={STATUS_OPTIONS} onChange={(v) => setDraft({ ...draft, status: v })} className="w-full" /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">플랫폼</label><Input value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v })} /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">연재방식</label><Select value={draft.serialType} options={SERIAL_TYPE_OPTIONS} onChange={(v) => setDraft({ ...draft, serialType: v })} className="w-full" /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">요일</label>
                <select value={draft.dayOfWeek || ''} onChange={(e) => setDraft({ ...draft, dayOfWeek: (e.target.value || undefined) as DayOfWeek | undefined })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">선택 안 함</option>
                  {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-400 mb-1 block">연재 시작</label><input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">연재 종료</label><input type="date" value={draft.endDate || ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value || undefined })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></div>
              <div><label className="text-xs text-zinc-400 mb-1 block">비독점 변경일</label><input type="date" value={draft.nonExclusiveDate || ''} onChange={(e) => setDraft({ ...draft, nonExclusiveDate: e.target.value || undefined })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></div>
            </div>
            <div><label className="text-xs text-zinc-400 mb-1 block">키워드 (쉼표 구분)</label><Input value={draft.keywords.join(', ')} onChange={(v) => setDraft({ ...draft, keywords: v.split(',').map(k => k.trim()).filter(Boolean) })} /></div>
            <div><label className="text-xs text-zinc-400 mb-1 block">엘리먼트</label>
              <textarea value={draft.element} onChange={(e) => setDraft({ ...draft, element: e.target.value })} rows={2} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            </div>
            <div><label className="text-xs text-zinc-400 mb-1 block">로그라인</label>
              <textarea value={draft.logline} onChange={(e) => setDraft({ ...draft, logline: e.target.value })} rows={5} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            </div>
            <EditActions onSave={() => save('basic')} onCancel={() => cancel('basic')} />
          </div>
        ) : (
          <div className="p-5">
            <div className="flex gap-6">
              {/* 썸네일 (왼쪽) */}
              <div
                className="w-48 h-64 rounded-2xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0 cursor-pointer group relative shadow-md"
                onClick={() => fileInputRef.current?.click()}
              >
                {data.thumbnailUrl ? (
                  <img src={data.thumbnailUrl} alt={data.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-zinc-300 dark:text-zinc-600">
                    <ImagePlus className="h-7 w-7" />
                    <span className="text-[10px]">썸네일 등록</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                  <ImagePlus className="h-5 w-5 text-white" />
                </div>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleThumbnailUpload} />
              </div>

              {/* 정보 (오른쪽) */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* 작품명 + 레이블 + 상태 */}
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  {data.titleUrl ? (
                    <a href={data.titleUrl} target="_blank" rel="noopener noreferrer" className="text-2xl font-bold tracking-tight hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors inline-flex items-center gap-1.5">
                      {data.title}
                      <ExternalLink className="h-4 w-4 flex-shrink-0 opacity-40" />
                    </a>
                  ) : (
                    <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
                  )}
                  {data.teamLabel && (
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{data.teamLabel}</span>
                  )}
                  <span className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-sm font-semibold ${STATUS_COLORS[data.status]}`}>{data.status}</span>
                </div>

                {/* 작가 */}
                <div>
                  <FieldLabel>작가</FieldLabel>
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    {data.creators.map((c, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[c.role] || ROLE_COLORS['기타']}`}>{c.role}</span>
                        <span className="text-sm font-medium">{c.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 연령등급 / 장르 / 에피소드수 / 플랫폼 / 연재방식 / 요일 */}
                <div className="grid grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-2">
                  <div>
                    <FieldLabel>연령 등급</FieldLabel>
                    <FieldValue>{data.ageRating}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>장르</FieldLabel>
                    <div className="flex gap-1 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">{data.mainGenre}</span>
                      {data.subGenre && <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-[10px] font-semibold">{data.subGenre}</span>}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>에피소드</FieldLabel>
                    <FieldValue>{data.episodeCount}화</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>플랫폼</FieldLabel>
                    <FieldValue>{data.platform}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>연재방식</FieldLabel>
                    <FieldValue>{data.serialType}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>요일</FieldLabel>
                    <FieldValue>{data.dayOfWeek}</FieldValue>
                  </div>
                </div>

                {/* 날짜 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <FieldLabel>연재 시작</FieldLabel>
                    <FieldValue>{data.startDate}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>연재 종료</FieldLabel>
                    <FieldValue>{data.endDate || <span className="text-green-500">연재중</span>}</FieldValue>
                  </div>
                  <div>
                    <FieldLabel>비독점 변경일</FieldLabel>
                    <FieldValue className="text-amber-600 dark:text-amber-400">{data.nonExclusiveDate}</FieldValue>
                  </div>
                </div>
              </div>
            </div>

            {/* 키워드 + 엘리먼트 + 로그라인 */}
            <div className="mt-4">
              <FieldLabel>키워드</FieldLabel>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {data.keywords.map(kw => <span key={kw} className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium">#{kw}</span>)}
              </div>
            </div>

            <div className="mt-4">
              <FieldLabel>엘리먼트</FieldLabel>
              <div className="text-sm leading-relaxed mt-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3">{data.element}</div>
            </div>

            <div className="mt-4">
              <FieldLabel>로그라인</FieldLabel>
              <div className="text-sm leading-relaxed mt-1 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3 whitespace-pre-line">{data.logline}</div>
            </div>
          </div>
        )}
      </div>

      {/* ───── 글로벌 전개 현황 ───── */}
      <Section icon={Globe} title="글로벌 전개 현황" accent="text-teal-500" onEdit={() => startEdit('global')} editing={editingGlobal}>
        {editingGlobal && draft ? (
          <div className="p-5 space-y-3">
            {GLOBAL_COUNTRIES.map((gc) => {
              const info = draft.globalInfo[gc.code] || { status: '미진출' as const };
              const updateCountry = (patch: Partial<CountryPublishing>) => {
                const newGlobal = { ...draft.globalInfo };
                newGlobal[gc.code] = { ...info, ...patch };
                setDraft({ ...draft, globalInfo: newGlobal });
              };
              return (
                <div key={gc.code} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{gc.flag}</span>
                    <span className="text-sm font-semibold">{gc.label}</span>
                    <select value={info.status} onChange={(e) => updateCountry({ status: e.target.value as CountryPublishing['status'] })}
                      className="ml-auto rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs">
                      {COUNTRY_PUB_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {info.status !== '미진출' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Input value={info.platform || ''} onChange={(v) => updateCountry({ platform: v })} placeholder="플랫폼" className="text-xs" />
                      <Input value={info.title || ''} onChange={(v) => updateCountry({ title: v })} placeholder="현지 제목" className="text-xs" />
                      <input type="date" value={info.startDate || ''} onChange={(e) => updateCountry({ startDate: e.target.value || undefined })} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs" />
                      <input type="number" value={info.episodeCount || ''} onChange={(e) => updateCountry({ episodeCount: parseInt(e.target.value) || undefined })} placeholder="화수" className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 text-xs" />
                    </div>
                  )}
                </div>
              );
            })}
            <EditActions onSave={() => save('global')} onCancel={() => cancel('global')} />
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {GLOBAL_COUNTRIES.map((gc) => {
                const info = data.globalInfo[gc.code];
                const isActive = info && info.status !== '미진출';
                return (
                  <div key={gc.code} className={`rounded-xl border p-4 ${isActive ? 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700' : 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">{gc.flag}</span>
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{gc.label}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_COLORS[info?.status || '미진출']}`}>{info?.status || '미진출'}</span>
                    </div>
                    {isActive && info && (
                      <div className="space-y-1 text-xs">
                        {info.platform && <div className="flex justify-between"><span className="text-zinc-400">플랫폼</span><span className="font-medium">{info.platform}</span></div>}
                        {info.title && <div className="flex justify-between"><span className="text-zinc-400">현지 제목</span><span className="font-medium">{info.title}</span></div>}
                        {info.startDate && <div className="flex justify-between"><span className="text-zinc-400">시작</span><span className="font-medium">{info.startDate}</span></div>}
                        {info.episodeCount && <div className="flex justify-between"><span className="text-zinc-400">화수</span><span className="font-medium">{info.episodeCount}화</span></div>}
                      </div>
                    )}
                    {!isActive && <p className="text-xs text-zinc-400">미진출</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ───── 2차 사업 정보 ───── */}
      <Section icon={Clapperboard} title="2차 사업 정보" accent="text-orange-500" onEdit={() => startEdit('biz')} editing={editingBiz}>
        {editingBiz && draft ? (
          <div className="p-5 space-y-4">
            {BIZ_CATEGORIES.map((cat) => {
              const items = draft.secondaryBiz.filter(b => b.category === cat);
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span>{BIZ_ICONS[cat]}</span>
                    <span className="text-sm font-semibold">{cat}</span>
                    <button onClick={() => setDraft({ ...draft, secondaryBiz: [...draft.secondaryBiz, { category: cat, status: '준비중' }] })} className="ml-auto text-xs text-cyan-500 hover:text-cyan-600 flex items-center gap-1"><Plus className="h-3 w-3" /> 추가</button>
                  </div>
                  {items.length === 0 && <p className="text-xs text-zinc-400 ml-7 mb-2">등록된 항목 없음</p>}
                  {items.map((item, idx) => {
                    const globalIdx = draft.secondaryBiz.indexOf(item);
                    const update = (patch: Partial<SecondaryBizItem>) => { const nb = [...draft.secondaryBiz]; nb[globalIdx] = { ...nb[globalIdx], ...patch }; setDraft({ ...draft, secondaryBiz: nb }); };
                    return (
                      <div key={idx} className="ml-7 mb-2 flex gap-2 items-center">
                        <Input value={item.title || ''} onChange={(v) => update({ title: v })} placeholder="제목" className="flex-1 text-xs" />
                        <Input value={item.status} onChange={(v) => update({ status: v })} placeholder="상태" className="w-24 text-xs" />
                        <Input value={item.partner || ''} onChange={(v) => update({ partner: v })} placeholder="파트너" className="w-28 text-xs" />
                        <button onClick={() => setDraft({ ...draft, secondaryBiz: draft.secondaryBiz.filter((_, j) => j !== globalIdx) })} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <EditActions onSave={() => save('biz')} onCancel={() => cancel('biz')} />
          </div>
        ) : (
          <div className="p-5">
            {BIZ_CATEGORIES.map((cat) => {
              const items = data.secondaryBiz.filter(b => b.category === cat);
              return (
                <div key={cat} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span>{BIZ_ICONS[cat]}</span>
                    <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">{cat}</span>
                    <span className="text-[10px] text-zinc-400">{items.length}건</span>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-zinc-300 dark:text-zinc-600 ml-7">없음</p>
                  ) : (
                    <div className="ml-7 space-y-1.5">
                      {items.map((biz, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-xs">
                          <span className="font-medium flex-1">{biz.title || '-'}</span>
                          <span className="text-zinc-400">{biz.status}</span>
                          {biz.partner && <span className="text-zinc-400">| {biz.partner}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ───── 특이사항 ───── */}
      <Section icon={ScrollText} title="특이사항" onEdit={() => startEdit('notes')} editing={editingNotes}>
        {editingNotes && draft ? (
          <div className="p-5">
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={6} placeholder="작품에 대한 메모, 특이사항을 입력하세요..."
              className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            <EditActions onSave={() => save('notes')} onCancel={() => cancel('notes')} />
          </div>
        ) : (
          <div className="p-5">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {data.notes || <span className="text-zinc-300 dark:text-zinc-600">특이사항 없음</span>}
            </p>
          </div>
        )}
      </Section>

      <div className="pb-8" />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl dark:border dark:border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-lg font-bold mb-1">작품 삭제</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                <strong>{data.title}</strong>을(를) 삭제하시겠습니까?<br />
                저장된 데이터와 썸네일이 모두 삭제됩니다.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                취소
              </button>
              <button
                onClick={() => { deleteTitle(slug); router.push('/accounting/sales/master'); }}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
