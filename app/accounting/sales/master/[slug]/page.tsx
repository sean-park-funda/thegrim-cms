'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import {
  getTitleBySlug,
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
} from '@/lib/sales/title-master-data';
import {
  ArrowLeft,
  BookOpen,
  Globe,
  Clapperboard,
  ScrollText,
  Pencil,
  Check,
  X,
  Plus,
  Trash2,
} from 'lucide-react';

// ─── 상수 ───
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

// ─── 공통 UI ───
function Section({ icon: Icon, title, children, accent, onEdit, editing }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  accent?: string;
  onEdit?: () => void;
  editing?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent || 'text-zinc-400'}`} />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 flex-1">{title}</h2>
        {onEdit && !editing && (
          <button onClick={onEdit} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start py-2.5 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
      <span className="w-28 flex-shrink-0 text-xs text-zinc-400 dark:text-zinc-500 pt-0.5">{label}</span>
      <div className="flex-1 text-sm font-medium min-w-0">
        {children || <span className="text-zinc-300 dark:text-zinc-600">-</span>}
      </div>
    </div>
  );
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
    <input
      type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 ${className || 'w-full'}`}
    />
  );
}

function Select<T extends string>({ value, options, onChange, className }: { value: T; options: readonly T[]; onChange: (v: T) => void; className?: string }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value as T)}
      className={`rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 ${className || ''}`}
    >{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
  );
}

// ─── 메인 ───
export default function MasterDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { profile } = useStore();
  const titleData = getTitleBySlug(slug);
  const [data, setData] = useState<TitleMasterInfo | null>(titleData ? { ...titleData } : null);

  // 편집 상태
  const [editingBasic, setEditingBasic] = useState(false);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [editingBiz, setEditingBiz] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);

  // 편집 임시 데이터
  const [draft, setDraft] = useState<TitleMasterInfo | null>(null);

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
    setData({ ...draft });
    if (section === 'basic') setEditingBasic(false);
    if (section === 'global') setEditingGlobal(false);
    if (section === 'biz') setEditingBiz(false);
    if (section === 'notes') setEditingNotes(false);
  }, [draft]);

  const cancel = useCallback((section: string) => {
    if (section === 'basic') setEditingBasic(false);
    if (section === 'global') setEditingGlobal(false);
    if (section === 'biz') setEditingBiz(false);
    if (section === 'notes') setEditingNotes(false);
  }, []);

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
    <div className="space-y-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/accounting/sales/master" className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight truncate">{data.title}</h1>
            <span className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${STATUS_COLORS[data.status]}`}>{data.status}</span>
          </div>
        </div>
      </div>

      {/* ───── 기본 정보 (통합) ───── */}
      <Section icon={BookOpen} title="기본 정보" accent="text-cyan-500" onEdit={() => startEdit('basic')} editing={editingBasic}>
        {editingBasic && draft ? (
          <div className="px-5 py-4 space-y-4">
            {/* 작품명 & 상태 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">작품명</label>
                <Input value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">상태</label>
                <Select value={draft.status} options={STATUS_OPTIONS} onChange={(v) => setDraft({ ...draft, status: v })} className="w-full" />
              </div>
            </div>
            {/* 플랫폼 / 연재방식 / 요일 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">플랫폼</label>
                <Input value={draft.platform} onChange={(v) => setDraft({ ...draft, platform: v })} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">연재방식</label>
                <Select value={draft.serialType} options={SERIAL_TYPE_OPTIONS} onChange={(v) => setDraft({ ...draft, serialType: v })} className="w-full" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">요일</label>
                <select
                  value={draft.dayOfWeek || ''} onChange={(e) => setDraft({ ...draft, dayOfWeek: (e.target.value || undefined) as DayOfWeek | undefined })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">선택 안 함</option>
                  {DAY_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
            {/* 날짜 */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">연재 시작</label>
                <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">연재 종료</label>
                <input type="date" value={draft.endDate || ''} onChange={(e) => setDraft({ ...draft, endDate: e.target.value || undefined })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">비독점 변경일</label>
                <input type="date" value={draft.nonExclusiveDate || ''} onChange={(e) => setDraft({ ...draft, nonExclusiveDate: e.target.value || undefined })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
            </div>
            {/* 에피소드 & 연령 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">에피소드 수</label>
                <input type="number" value={draft.episodeCount} onChange={(e) => setDraft({ ...draft, episodeCount: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">연령 등급</label>
                <Input value={draft.ageRating} onChange={(v) => setDraft({ ...draft, ageRating: v })} />
              </div>
            </div>
            {/* 작가 */}
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
                    <button onClick={() => { const nc = draft.creators.filter((_, j) => j !== i); setDraft({ ...draft, creators: nc }); }} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => setDraft({ ...draft, creators: [...draft.creators, { role: '기타', name: '' }] })} className="text-xs text-cyan-500 hover:text-cyan-600 flex items-center gap-1"><Plus className="h-3 w-3" /> 작가 추가</button>
              </div>
            </div>
            {/* 장르 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">주장르</label>
                <Input value={draft.mainGenre} onChange={(v) => setDraft({ ...draft, mainGenre: v })} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">부장르</label>
                <Input value={draft.subGenre || ''} onChange={(v) => setDraft({ ...draft, subGenre: v || undefined })} />
              </div>
            </div>
            {/* 키워드 */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">키워드 (쉼표 구분)</label>
              <Input value={draft.keywords.join(', ')} onChange={(v) => setDraft({ ...draft, keywords: v.split(',').map(k => k.trim()).filter(Boolean) })} />
            </div>
            {/* 엘리먼트 / 로그라인 */}
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">엘리먼트</label>
              <textarea value={draft.element} onChange={(e) => setDraft({ ...draft, element: e.target.value })} rows={2}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">로그라인</label>
              <textarea value={draft.logline} onChange={(e) => setDraft({ ...draft, logline: e.target.value })} rows={5}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
            </div>
            <EditActions onSave={() => save('basic')} onCancel={() => cancel('basic')} />
          </div>
        ) : (
          <div className="px-5 py-3">
            <InfoRow label="작품명">{data.title}</InfoRow>
            <InfoRow label="상태">
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_COLORS[data.status]}`}>{data.status}</span>
            </InfoRow>
            <InfoRow label="플랫폼">
              <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium">{data.platform}</span>
            </InfoRow>
            <InfoRow label="연재방식">{data.serialType}</InfoRow>
            {data.dayOfWeek && <InfoRow label="요일">{data.dayOfWeek}</InfoRow>}
            <InfoRow label="연재 시작">{data.startDate}</InfoRow>
            <InfoRow label="연재 종료">{data.endDate || <span className="text-green-500">연재중</span>}</InfoRow>
            {data.nonExclusiveDate && (
              <InfoRow label="비독점 변경일">
                <span className="text-amber-600 dark:text-amber-400">{data.nonExclusiveDate}</span>
              </InfoRow>
            )}
            <InfoRow label="에피소드 수">{data.episodeCount}화</InfoRow>
            <InfoRow label="연령 등급">{data.ageRating}</InfoRow>

            {/* 작가 */}
            <InfoRow label="작가">
              <div className="flex flex-wrap gap-2">
                {data.creators.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${ROLE_COLORS[c.role] || ROLE_COLORS['기타']}`}>{c.role}</span>
                    <span className="text-sm">{c.name}</span>
                  </span>
                ))}
              </div>
            </InfoRow>

            {/* 장르 */}
            <InfoRow label="장르">
              <div className="flex gap-2">
                <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">주: {data.mainGenre}</span>
                {data.subGenre && <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold">부: {data.subGenre}</span>}
              </div>
            </InfoRow>

            {/* 키워드 */}
            <InfoRow label="키워드">
              <div className="flex flex-wrap gap-1.5">
                {data.keywords.map(kw => <span key={kw} className="px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs">#{kw}</span>)}
              </div>
            </InfoRow>

            {/* 엘리먼트 */}
            <InfoRow label="엘리먼트">
              <p className="text-sm leading-relaxed whitespace-pre-line">{data.element}</p>
            </InfoRow>

            {/* 로그라인 */}
            <InfoRow label="로그라인">
              <p className="text-sm leading-relaxed whitespace-pre-line">{data.logline}</p>
            </InfoRow>
          </div>
        )}
      </Section>

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
                    <button onClick={() => setDraft({ ...draft, secondaryBiz: [...draft.secondaryBiz, { category: cat, status: '준비중' }] })} className="ml-auto text-xs text-cyan-500 hover:text-cyan-600 flex items-center gap-1">
                      <Plus className="h-3 w-3" /> 추가
                    </button>
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
    </div>
  );
}
