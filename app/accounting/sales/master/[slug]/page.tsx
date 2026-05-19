'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { getTitleBySlug, COUNTRIES } from '@/lib/sales/title-master-data';
import {
  ArrowLeft,
  BookOpen,
  Users,
  Tag,
  Globe,
  Clapperboard,
  ScrollText,
  Calendar,
  Hash,
  Shield,
  Clock,
  FileText,
} from 'lucide-react';

function Section({
  icon: Icon,
  title,
  children,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent || 'text-zinc-400'}`} />
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start py-2.5 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
      <span className="w-28 flex-shrink-0 text-xs text-zinc-400 dark:text-zinc-500 pt-0.5">
        {label}
      </span>
      <div className="flex-1 text-sm font-medium min-w-0">
        {children || <span className="text-zinc-300 dark:text-zinc-600">-</span>}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  '연재중': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  '완결': 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  '휴재': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  '미진출': 'bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500',
  '계약중': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  '준비중': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const ROLE_COLORS: Record<string, string> = {
  '글': 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
  '그림': 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  '원작': 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  '컬러': 'bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400',
  '각색': 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400',
  '기타': 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

const BIZ_TYPE_ICONS: Record<string, string> = {
  '출판': '📚', '드라마': '📺', '영화': '🎬',
  '애니메이션': '🎞️', '라이선스': '📄', '기타': '📋',
};

export default function MasterDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { profile } = useStore();

  const title = getTitleBySlug(slug);

  if (!profile || !canViewSales(profile.role)) return null;

  if (!title) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-4">
        <span className="text-sm">작품을 찾을 수 없습니다</span>
        <Link href="/accounting/sales/master" className="text-sm text-cyan-600 hover:underline">
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          href="/accounting/sales/master"
          className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight truncate">
              {title.title}
            </h1>
            <span
              className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                STATUS_COLORS[title.status] || STATUS_COLORS['완결']
              }`}
            >
              {title.status}
            </span>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <Section icon={BookOpen} title="기본 정보" accent="text-cyan-500">
        <div className="px-5 py-3">
          <InfoRow label="작품명">{title.title}</InfoRow>
          <InfoRow label="플랫폼">
            <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-medium">
              {title.platform}
            </span>
          </InfoRow>
          {title.dayOfWeek && (
            <InfoRow label="연재 요일">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                {title.dayOfWeek}
              </span>
            </InfoRow>
          )}
          <InfoRow label="연재 시작">{title.startDate}</InfoRow>
          <InfoRow label="연재 종료">
            {title.endDate || <span className="text-green-500">연재중</span>}
          </InfoRow>
          {title.nonExclusiveDate && (
            <InfoRow label="비독점 변경일">
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Clock className="h-3.5 w-3.5" />
                {title.nonExclusiveDate}
              </span>
            </InfoRow>
          )}
          <InfoRow label="에피소드 수">
            <span className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-zinc-400" />
              {title.episodeCount}화
            </span>
          </InfoRow>
          <InfoRow label="연령 등급">
            <span className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-zinc-400" />
              {title.ageRating}
            </span>
          </InfoRow>
        </div>
      </Section>

      {/* 작가 정보 */}
      <Section icon={Users} title="작가 정보" accent="text-purple-500">
        <div className="p-5">
          <div className="flex flex-wrap gap-3">
            {title.creators.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800"
              >
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-sm font-bold">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <span
                    className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      ROLE_COLORS[c.role] || ROLE_COLORS['기타']
                    }`}
                  >
                    {c.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 장르 & 키워드 */}
      <Section icon={Tag} title="장르 & 키워드" accent="text-blue-500">
        <div className="p-5 space-y-4">
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">장르</span>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-3 py-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                주: {title.mainGenre}
              </span>
              {title.subGenre && (
                <span className="px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                  부: {title.subGenre}
                </span>
              )}
            </div>
          </div>
          <div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">키워드</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {title.keywords.map((kw) => (
                <span
                  key={kw}
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium"
                >
                  #{kw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 엘리먼트 & 로그라인 */}
      <Section icon={FileText} title="작품 설명" accent="text-emerald-500">
        <div className="p-5 space-y-5">
          <div>
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              엘리먼트
            </span>
            <p className="text-sm mt-2 leading-relaxed text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3">
              {title.element}
            </p>
          </div>
          <div>
            <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              로그라인
            </span>
            <div className="text-sm mt-2 leading-relaxed text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3 whitespace-pre-line">
              {title.logline}
            </div>
          </div>
        </div>
      </Section>

      {/* 국가별 진출 현황 */}
      <Section icon={Globe} title="국가별 진출 현황" accent="text-teal-500">
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {COUNTRIES.map((c) => {
              const info = title.countryInfo[c.code];
              const isActive = info.status !== '미진출';
              return (
                <div
                  key={c.code}
                  className={`rounded-xl border p-4 ${
                    isActive
                      ? 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700'
                      : 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg">{c.flag}</span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        STATUS_COLORS[info.status] || STATUS_COLORS['미진출']
                      }`}
                    >
                      {info.status}
                    </span>
                  </div>
                  {isActive ? (
                    <div className="space-y-1.5 text-xs">
                      {info.platform && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">플랫폼</span>
                          <span className="font-medium">{info.platform}</span>
                        </div>
                      )}
                      {info.title && info.title !== title.title && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">현지 제목</span>
                          <span className="font-medium">{info.title}</span>
                        </div>
                      )}
                      {info.startDate && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">시작</span>
                          <span className="font-medium">{info.startDate}</span>
                        </div>
                      )}
                      {info.endDate && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">종료</span>
                          <span className="font-medium">{info.endDate}</span>
                        </div>
                      )}
                      {info.episodeCount && (
                        <div className="flex justify-between">
                          <span className="text-zinc-400">화수</span>
                          <span className="font-medium">{info.episodeCount}화</span>
                        </div>
                      )}
                      {info.note && (
                        <p className="text-zinc-400 mt-1 pt-1 border-t border-zinc-100 dark:border-zinc-700">
                          {info.note}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      미진출
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* 2차 사업 정보 */}
      <Section icon={Clapperboard} title="2차 사업 정보" accent="text-orange-500">
        <div className="p-5">
          {title.secondaryBiz && title.secondaryBiz.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {title.secondaryBiz.map((biz, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800"
                >
                  <span className="text-lg mt-0.5">
                    {BIZ_TYPE_ICONS[biz.type] || '📋'}
                  </span>
                  <div>
                    <p className="text-sm font-medium">
                      {biz.type}
                      {biz.title ? ` — ${biz.title}` : ''}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {biz.status}
                      {biz.partner ? ` | ${biz.partner}` : ''}
                    </p>
                    {biz.note && (
                      <p className="text-xs text-zinc-400 mt-1">{biz.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-300 dark:text-zinc-600 text-center py-4">
              등록된 2차 사업이 없습니다
            </p>
          )}
        </div>
      </Section>

      {/* 특이사항 */}
      <Section icon={ScrollText} title="특이사항">
        <div className="p-5">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {title.notes || (
              <span className="text-zinc-300 dark:text-zinc-600">특이사항 없음</span>
            )}
          </p>
        </div>
      </Section>

      <div className="pb-8" />
    </div>
  );
}
