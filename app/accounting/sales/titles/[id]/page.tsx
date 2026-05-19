'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales, canManageAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { GlobalLaunchesTab } from '@/components/works/GlobalLaunchesTab';
import { SecondaryBizTab } from '@/components/works/SecondaryBizTab';
import {
  ArrowLeft, BookOpen, Users, Globe, Film, FileText,
  Pencil, Tag, Tv, Clapperboard, ScrollText,
} from 'lucide-react';

interface WorkDetail {
  work: {
    id: string;
    name: string;
    naver_name: string | null;
    contract_type: string | null;
    serial_start_date: string | null;
    serial_end_date: string | null;
    is_active: boolean;
    label: string | null;
    platform: string | null;
    episode_count: number | null;
    genre: string[] | null;
    logline: string | null;
    element: string | null;
    thumbnail_url: string | null;
    note: string | null;
  };
  partners: { id: string; partner: { id: string; name: string; pen_name: string | null } | null; rs_rate: number }[];
  globalLaunches: { id: string; country_code: string; platform_name: string | null; url: string | null; status: string; launched_at: string | null; note: string | null }[];
  secondaryBiz: { id: string; biz_type: string; title: string | null; status: string; partner: string | null; contract_date: string | null; note: string | null; work_id: string }[];
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  exclusive: '독점',
  non_exclusive: '비독점',
  management: '매니지먼트',
};

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-zinc-400 dark:text-zinc-500 text-xs">{label}</span>
      <div className="mt-0.5 text-sm font-medium">{children || <span className="text-zinc-300 dark:text-zinc-600">-</span>}</div>
    </div>
  );
}

export default function TitleDetailPage() {
  const params = useParams();
  const workId = params.id as string;
  const { profile } = useStore();

  const [data, setData] = useState<WorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingDates, setEditingDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateSaving, setDateSaving] = useState(false);

  const canManage = profile ? canManageAccounting(profile.role) : false;

  const loadData = useCallback(() => {
    if (!profile || !canViewSales(profile.role) || !workId) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales/works/${workId}?from=2020-01-01&to=2030-12-31`)
      .then(r => r.json())
      .then((d: WorkDetail) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, workId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveDates = async () => {
    setDateSaving(true);
    try {
      await settlementFetch(`/api/accounting/settlement/works/${workId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_start_date: startDate || null,
          serial_end_date: endDate || null,
        }),
      });
      setData(prev => prev ? {
        ...prev,
        work: { ...prev.work, serial_start_date: startDate || null, serial_end_date: endDate || null }
      } : prev);
      setEditingDates(false);
    } catch (e) {
      console.error('날짜 저장 오류:', e);
    } finally {
      setDateSaving(false);
    }
  };

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      await settlementFetch(`/api/accounting/settlement/works/${workId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteText }),
      });
      setData(prev => prev ? { ...prev, work: { ...prev.work, note: noteText } } : prev);
      setEditingNote(false);
    } catch (e) {
      console.error('메모 저장 오류:', e);
    } finally {
      setNoteSaving(false);
    }
  };

  if (!profile || !canViewSales(profile.role)) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/accounting/sales/titles"
          className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {data?.work?.name || '로딩 중...'}
          </h1>
          {data?.work?.naver_name && data.work.naver_name !== data.work.name && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              네이버: {data.work.naver_name}
            </p>
          )}
        </div>
        {data?.work && (
          <span className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium ${
            data.work.is_active
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
          }`}>
            {data.work.is_active ? '연재중' : '완결'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">작품 정보를 불러오는 중...</span>
          </div>
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">데이터 없음</div>
      ) : (
        <>
          {/* 기본 정보 + 썸네일 */}
          <Section icon={BookOpen} title="기본 정보">
            <div className="p-5 flex gap-6">
              {/* 썸네일 */}
              <div className="w-28 h-36 rounded-xl bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                {data.work.thumbnail_url ? (
                  <img
                    src={data.work.thumbnail_url}
                    alt={data.work.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
                  </div>
                )}
              </div>

              {/* 정보 그리드 */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 content-start">
                <InfoItem label="작품명">{data.work.name}</InfoItem>
                {data.work.naver_name && data.work.naver_name !== data.work.name && (
                  <InfoItem label="네이버 작품명">{data.work.naver_name}</InfoItem>
                )}
                <InfoItem label="계약 형태">
                  {data.work.contract_type ? CONTRACT_TYPE_LABELS[data.work.contract_type] || data.work.contract_type : null}
                </InfoItem>
                <InfoItem label="레이블">{data.work.label}</InfoItem>
                <InfoItem label="플랫폼">{data.work.platform}</InfoItem>
                <InfoItem label="에피소드 수">
                  {data.work.episode_count ? `${data.work.episode_count}화` : null}
                </InfoItem>

                {/* 연재 기간 (편집 가능) */}
                {editingDates ? (
                  <div className="col-span-2 md:col-span-3">
                    <div className="grid grid-cols-2 gap-4 max-w-md">
                      <div>
                        <label className="text-zinc-400 dark:text-zinc-500 text-xs">연재 시작</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 dark:text-zinc-500 text-xs">연재 종료</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setEditingDates(false)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleSaveDates}
                        disabled={dateSaving}
                        className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors disabled:opacity-50"
                      >
                        {dateSaving ? '저장 중...' : '저장'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="relative group">
                      <InfoItem label="연재 시작">{data.work.serial_start_date}</InfoItem>
                      {canManage && (
                        <button
                          onClick={() => { setStartDate(data.work.serial_start_date || ''); setEndDate(data.work.serial_end_date || ''); setEditingDates(true); }}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <InfoItem label="연재 종료">
                        {data.work.serial_end_date || (data.work.is_active ? <span className="text-green-500">연재중</span> : null)}
                      </InfoItem>
                      {canManage && (
                        <button
                          onClick={() => { setStartDate(data.work.serial_start_date || ''); setEndDate(data.work.serial_end_date || ''); setEditingDates(true); }}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-all"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Section>

          {/* 작가 정보 */}
          {data.partners.length > 0 && (
            <Section icon={Users} title="작가 정보">
              <div className="p-5">
                <div className="flex flex-wrap gap-3">
                  {data.partners.map(wp => (
                    <div
                      key={wp.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800"
                    >
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                        {(wp.partner?.pen_name || wp.partner?.name || '?').charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {wp.partner?.pen_name || wp.partner?.name || '-'}
                        </p>
                        {wp.partner?.pen_name && wp.partner?.name && wp.partner.pen_name !== wp.partner.name && (
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">{wp.partner.name}</p>
                        )}
                      </div>
                      <span className="ml-2 px-2 py-0.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                        RS {(wp.rs_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* 장르 / 로그라인 / 엘리먼트 */}
          <Section icon={Tag} title="작품 설명">
            <div className="p-5 space-y-4">
              {data.work.genre && data.work.genre.length > 0 && (
                <div>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">장르</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {data.work.genre.map(g => (
                      <span key={g} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">로그라인</span>
                <p className="text-sm mt-1 leading-relaxed">
                  {data.work.logline || <span className="text-zinc-300 dark:text-zinc-600">-</span>}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">엘리먼트</span>
                <p className="text-sm mt-1 leading-relaxed">
                  {data.work.element || <span className="text-zinc-300 dark:text-zinc-600">-</span>}
                </p>
              </div>
            </div>
          </Section>

          {/* 국가별 론칭 정보 */}
          <Section icon={Globe} title="국가별 론칭 정보">
            <div className="px-5 py-4">
              <GlobalLaunchesTab
                workId={workId}
                launches={data.globalLaunches}
                canManage={canManage}
                onReload={loadData}
              />
            </div>
          </Section>

          {/* 2차 사업 정보 */}
          <Section icon={Clapperboard} title="2차 사업 정보">
            <div className="px-5 py-4">
              <SecondaryBizTab
                workId={workId}
                items={data.secondaryBiz}
                canManage={canManage}
                onReload={loadData}
              />
            </div>
          </Section>

          {/* 특이사항 */}
          <Section icon={ScrollText} title="특이사항">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">메모 및 특이사항</span>
                {canManage && !editingNote && (
                  <button
                    onClick={() => { setNoteText(data.work.note || ''); setEditingNote(true); }}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {editingNote ? (
                <div className="space-y-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={5}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                    placeholder="작품에 대한 특이사항을 입력하세요..."
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingNote(false)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSaveNote}
                      disabled={noteSaving}
                      className="px-3 py-1.5 text-xs rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition-colors disabled:opacity-50"
                    >
                      {noteSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {data.work.note || <span className="text-zinc-300 dark:text-zinc-600">특이사항 없음</span>}
                </p>
              )}
            </div>
          </Section>

          {/* 매출 분석 링크 */}
          <div className="flex justify-center pt-2 pb-8">
            <Link
              href={`/accounting/sales/works/${workId}`}
              className="text-sm text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              이 작품의 매출 분석 보기 →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
