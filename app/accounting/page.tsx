'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import {
  TrendingUp,
  Crown,
  BarChart3,
  Calculator,
  Upload,
  Search,
  FileText,
  BookOpen,
  Users,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Link from 'next/link';

const fmtShort = (n: number) =>
  n >= 100_000_000 ? `${(n / 100_000_000).toFixed(1)}억` : `${Math.round(n / 10_000).toLocaleString()}만`;

export default function AccountingPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [dailySales, setDailySales] = useState<{
    chartData: { date: string; total: number }[];
    totalSales: number;
    dailyAverage: number;
    topWork: { name: string; total: number } | null;
    workCount: number;
  } | null>(null);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
      return;
    }

    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 14);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = now.toISOString().slice(0, 10);

    settlementFetch(`/api/accounting/sales?from=${fromStr}&to=${toStr}`)
      .then(r => r.json())
      .then(data => {
        if (data.summary) {
          setDailySales({
            chartData: data.summary.dailyTotals?.map((d: { date: string; total: number }) => ({
              date: d.date.slice(5),
              total: d.total,
            })) || [],
            totalSales: data.summary.totalSales,
            dailyAverage: data.summary.dailyAverage,
            topWork: data.summary.topWork,
            workCount: data.summary.workCount,
          });
        }
      })
      .catch(() => {});
  }, [profile, router]);

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const salesLinks = [
    { href: '/accounting/sales', label: '매출 대시보드', desc: '일별 매출 추이와 작품별 현황', icon: BarChart3, color: 'from-cyan-400 to-blue-500' },
    { href: '/accounting/sales/works', label: '작품별 매출', desc: '날짜별 작품 매출 상세', icon: BookOpen, color: 'from-violet-400 to-purple-500' },
    { href: '/accounting/sales/ranking', label: '랭킹', desc: '작품별 매출 순위', icon: Crown, color: 'from-amber-400 to-orange-500' },
    { href: '/accounting/sales/growth', label: '성장률', desc: '작품별 매출 성장 추이', icon: TrendingUp, color: 'from-emerald-400 to-green-500' },
  ];

  const settlementLinks = [
    { href: '/accounting/settlement', label: '정산 대시보드', desc: '매출/정산 종합 현황', icon: Calculator, color: 'from-indigo-400 to-blue-500' },
    { href: '/accounting/settlement/upload', label: '엑셀 업로드', desc: '네이버 매출 데이터 업로드', icon: Upload, color: 'from-teal-400 to-cyan-500' },
    { href: '/accounting/settlement/revenue', label: '수익 조회', desc: '작품별 수익 상세 조회', icon: Search, color: 'from-pink-400 to-rose-500' },
    { href: '/accounting/settlement/settlements', label: '정산 내역', desc: '파트너별 정산 이력', icon: FileText, color: 'from-sky-400 to-blue-500' },
    { href: '/accounting/settlement/works', label: '작품 관리', desc: '작품 등록 및 RS 설정', icon: BookOpen, color: 'from-fuchsia-400 to-purple-500' },
    { href: '/accounting/settlement/partners', label: '파트너 관리', desc: '파트너 정보 및 계약 관리', icon: Users, color: 'from-orange-400 to-red-500' },
  ];

  return (
    <div className="min-h-full p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">회계</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">매출 분석과 RS 정산을 한눈에</p>
      </div>

      {/* 매출 미니 차트 */}
      {dailySales && dailySales.chartData.length > 0 && (
        <Link href="/accounting/sales" className="block">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight">최근 14일 매출</p>
                  <p className="text-xs text-zinc-400">{dailySales.workCount}개 작품</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tracking-tight">{fmtShort(dailySales.totalSales)}</p>
                <p className="text-xs text-zinc-400">일 평균 {fmtShort(dailySales.dailyAverage)}</p>
              </div>
            </div>

            {/* 미니 stat chips */}
            {dailySales.topWork && (
              <div className="flex gap-2 mb-4">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-xs font-medium">
                  <Crown className="h-3 w-3" />
                  {dailySales.topWork.name}
                </span>
                <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs">
                  {fmtShort(dailySales.topWork.total)}
                </span>
              </div>
            )}

            <div className="h-[140px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailySales.chartData}>
                  <defs>
                    <linearGradient id="homeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="none" />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [Number(value).toLocaleString() + '원', '매출']}
                    labelFormatter={(label) => String(label)}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#homeGrad)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Link>
      )}

      {/* 매출 분석 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">매출 분석</h2>
          <Link href="/accounting/sales" className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5 transition-colors">
            전체 보기 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {salesLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="group rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 flex items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} shadow-lg`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                  <p className="text-xs text-zinc-400 truncate">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* RS 정산 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold tracking-tight">RS 정산</h2>
          <Link href="/accounting/settlement" className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 flex items-center gap-0.5 transition-colors">
            전체 보기 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {settlementLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="group rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 flex items-center gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} shadow-lg`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight">{item.label}</p>
                  <p className="text-xs text-zinc-400 truncate">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* AI 검색 FAB */}
      <Link
        href="/accounting/sales/chat"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_4px_16px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_24px_rgba(99,102,241,0.5)] hover:scale-105 transition-all duration-300"
      >
        <Sparkles className="h-6 w-6 text-white" />
      </Link>
    </div>
  );
}
