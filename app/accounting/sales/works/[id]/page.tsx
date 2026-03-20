'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { PRESETS, fmtShort, fmtWon, getDateRange } from '@/lib/sales/types';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, BarChart3, Globe, Film, BookOpen } from 'lucide-react';

const fmtComma = (n: number) => n.toLocaleString();

interface WorkSalesData {
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
  dailySales: { date: string; amount: number }[];
  monthlySales: { month: string; total: number }[];
  partners: { id: string; partner: { id: string; name: string; pen_name: string | null } | null; rs_rate: number }[];
  globalLaunches: { id: string; country_code: string; platform_name: string | null; url: string | null; status: string; launched_at: string | null }[];
  secondaryBiz: { id: string; biz_type: string; title: string | null; status: string; partner: string | null; contract_date: string | null }[];
  revenues: { month: string; domestic_paid: number; global_paid: number; domestic_ad: number; global_ad: number; secondary: number; total: number }[];
  summary: { totalSales: number; dailyAverage: number; dayCount: number };
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  exclusive: '독점',
  non_exclusive: '비독점',
  management: '매니지먼트',
};

const COUNTRY_LABELS: Record<string, string> = {
  US: '북미', JP: '일본', TW: '대만', CN: '중국', ID: '인도네시아',
  FR: '프랑스', DE: '독일', TH: '태국', KR: '한국', ES: '스페인',
  IT: '이탈리아', BR: '브라질', VN: '베트남',
};

const LAUNCH_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planned: { label: '예정', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  live: { label: '서비스중', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  ended: { label: '종료', color: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
};

const BIZ_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planned: { label: '기획', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  in_progress: { label: '진행중', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: '취소', color: 'bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400' },
};

export default function WorkSalesDetailPage() {
  const params = useParams();
  const workId = params.id as string;
  const { profile } = useStore();

  const [data, setData] = useState<WorkSalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewSales(profile.role) || !workId) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales/works/${workId}?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: WorkSalesData) => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, workId, from, to]);

  if (!profile || !canViewSales(profile.role)) return null;

  const maxDaily = data ? Math.max(...(data.dailySales.map(d => d.amount)), 1) : 1;

  const trend = useMemo(() => {
    if (!data || data.dailySales.length < 2) return null;
    const sorted = [...data.dailySales].sort((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0].amount;
    const prev = sorted[1].amount;
    if (prev === 0) return null;
    const pct = ((latest - prev) / prev) * 100;
    return { pct, up: pct >= 0 };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/accounting/sales/works"
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
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">로딩 중...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-zinc-400">데이터 없음</div>
      ) : (
        <>
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

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">총 매출</div>
              <div className="text-xl font-bold tracking-tight">{fmtShort(data.summary.totalSales)}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">일 평균</div>
              <div className="text-xl font-bold tracking-tight">{fmtShort(Math.round(data.summary.dailyAverage))}</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">데이터 일수</div>
              <div className="text-xl font-bold tracking-tight">{data.summary.dayCount}일</div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">전일 대비</div>
              <div className="text-xl font-bold tracking-tight flex items-center gap-1">
                {trend ? (
                  <>
                    {trend.up ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={trend.up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                      {trend.up ? '+' : ''}{trend.pct.toFixed(1)}%
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
              </div>
            </div>
          </div>

          {/* 작품 정보 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">작품 정보</h2>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm">
              <div>
                <span className="text-zinc-400 dark:text-zinc-500">상태</span>
                <p className="font-medium mt-0.5">
                  {data.work.is_active ? (
                    <span className="text-green-600 dark:text-green-400">활성</span>
                  ) : (
                    <span className="text-zinc-400">비활성</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-zinc-400 dark:text-zinc-500">계약 형태</span>
                <p className="font-medium mt-0.5">
                  {data.work.contract_type ? CONTRACT_TYPE_LABELS[data.work.contract_type] || data.work.contract_type : '-'}
                </p>
              </div>
              <div>
                <span className="text-zinc-400 dark:text-zinc-500">연재 시작</span>
                <p className="font-medium mt-0.5">{data.work.serial_start_date || '-'}</p>
              </div>
              <div>
                <span className="text-zinc-400 dark:text-zinc-500">연재 종료</span>
                <p className="font-medium mt-0.5">{data.work.serial_end_date || '연재중'}</p>
              </div>
              {data.work.platform && (
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">플랫폼</span>
                  <p className="font-medium mt-0.5">{data.work.platform}</p>
                </div>
              )}
              {data.work.label && (
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">레이블</span>
                  <p className="font-medium mt-0.5">{data.work.label}</p>
                </div>
              )}
              {data.work.episode_count && (
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">에피소드</span>
                  <p className="font-medium mt-0.5">{data.work.episode_count}화</p>
                </div>
              )}
              {data.work.genre && data.work.genre.length > 0 && (
                <div>
                  <span className="text-zinc-400 dark:text-zinc-500">장르</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {data.work.genre.map(g => (
                      <span key={g} className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs font-medium">{g}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {data.work.logline && (
              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">로그라인</span>
                <p className="text-sm mt-0.5">{data.work.logline}</p>
              </div>
            )}
            {data.work.note && (
              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">특이사항</span>
                <p className="text-sm mt-0.5 whitespace-pre-wrap">{data.work.note}</p>
              </div>
            )}
            {data.partners.length > 0 && (
              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">파트너</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {data.partners.map(wp => (
                    <span
                      key={wp.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs"
                    >
                      <span className="font-medium">{wp.partner?.pen_name || wp.partner?.name || '-'}</span>
                      <span className="text-zinc-400 dark:text-zinc-500">{(wp.rs_rate * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 해외 론칭 정보 */}
          {data.globalLaunches.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <Globe className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">해외 론칭</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">국가</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">플랫폼</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">상태</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">론칭일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.globalLaunches.map(gl => {
                      const st = LAUNCH_STATUS_LABELS[gl.status] || { label: gl.status, color: 'bg-zinc-100 text-zinc-500' };
                      return (
                        <tr key={gl.id} className="border-t border-zinc-100 dark:border-zinc-800/50">
                          <td className="py-2.5 px-5 font-medium">{COUNTRY_LABELS[gl.country_code] || gl.country_code}</td>
                          <td className="py-2.5 px-5">
                            {gl.url ? (
                              <a href={gl.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                                {gl.platform_name || '링크'}
                              </a>
                            ) : (
                              gl.platform_name || '-'
                            )}
                          </td>
                          <td className="py-2.5 px-5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-5 text-zinc-500">{gl.launched_at || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2차 사업 */}
          {data.secondaryBiz.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <Film className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">2차 사업</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">유형</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">제목</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">파트너</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">상태</th>
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">계약일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.secondaryBiz.map(sb => {
                      const st = BIZ_STATUS_LABELS[sb.status] || { label: sb.status, color: 'bg-zinc-100 text-zinc-500' };
                      return (
                        <tr key={sb.id} className="border-t border-zinc-100 dark:border-zinc-800/50">
                          <td className="py-2.5 px-5 font-medium">{sb.biz_type}</td>
                          <td className="py-2.5 px-5">{sb.title || '-'}</td>
                          <td className="py-2.5 px-5">{sb.partner || '-'}</td>
                          <td className="py-2.5 px-5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-5 text-zinc-500">{sb.contract_date || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 정산 매출 (국내/해외 월별) */}
          {data.revenues.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <Globe className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">정산 매출 (국내/해외)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">월</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">국내유료</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">해외유료</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">국내광고</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">해외광고</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">2차</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.revenues.map(r => (
                      <tr key={r.month} className="border-t border-zinc-100 dark:border-zinc-800/50">
                        <td className="py-2.5 px-5 text-zinc-700 dark:text-zinc-300">{r.month}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums">{r.domestic_paid ? fmtComma(r.domestic_paid) : '-'}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums">{r.global_paid ? fmtComma(r.global_paid) : '-'}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums">{r.domestic_ad ? fmtComma(r.domestic_ad) : '-'}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums">{r.global_ad ? fmtComma(r.global_ad) : '-'}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums">{r.secondary ? fmtComma(r.secondary) : '-'}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums font-bold">{fmtComma(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 일별 매출 바 차트 */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">일별 매출 (네이버)</h2>
            </div>
            <div className="px-5 py-4">
              {data.dailySales.length === 0 ? (
                <div className="text-center text-zinc-400 py-8">데이터 없음</div>
              ) : (
                <div className="space-y-1">
                  {data.dailySales.map(d => {
                    const pct = (d.amount / maxDaily) * 100;
                    const dateObj = new Date(d.date);
                    const dayName = ['일','월','화','수','목','금','토'][dateObj.getDay()];
                    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                    return (
                      <div key={d.date} className="flex items-center gap-2 text-xs group">
                        <span className={`w-16 shrink-0 tabular-nums ${isWeekend ? 'text-red-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
                          {d.date.slice(5)} {dayName}
                        </span>
                        <div className="flex-1 h-5 bg-zinc-50 dark:bg-zinc-800/50 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500/80 dark:bg-blue-500/60 rounded transition-all duration-300 group-hover:bg-blue-500"
                            style={{ width: `${Math.max(pct, 0.5)}%` }}
                          />
                        </div>
                        <span className="w-20 text-right tabular-nums font-medium text-zinc-600 dark:text-zinc-300 shrink-0">
                          {fmtComma(d.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 월별 매출 (네이버) */}
          {data.monthlySales.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">월별 매출 (네이버)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                      <th className="text-left py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">월</th>
                      <th className="text-right py-2.5 px-5 font-medium text-zinc-500 dark:text-zinc-400">매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthlySales.map(m => (
                      <tr key={m.month} className="border-t border-zinc-100 dark:border-zinc-800/50">
                        <td className="py-2.5 px-5 text-zinc-700 dark:text-zinc-300">{m.month}</td>
                        <td className="py-2.5 px-5 text-right tabular-nums font-medium">{fmtWon(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                      <td className="py-2.5 px-5 font-bold text-zinc-700 dark:text-zinc-200">합계</td>
                      <td className="py-2.5 px-5 text-right tabular-nums font-bold">
                        {fmtWon(data.monthlySales.reduce((s, m) => s + m.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
