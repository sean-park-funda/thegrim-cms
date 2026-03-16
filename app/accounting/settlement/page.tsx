'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { DollarSign, Users, BookOpen, TrendingUp, MessageCircle, Menu, ChevronRight, Crown } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';
import { RsRevenue, RsSettlement } from '@/lib/types/settlement';
import { useSidebar } from '@/components/ui/sidebar';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const REVENUE_TYPES = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'] as const;

const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료',
  global_paid: '글로벌유료',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

const CHART_HEX: Record<string, string> = {
  domestic_paid: '#2563eb',
  global_paid: '#a855f7',
  domestic_ad: '#0d9488',
  global_ad: '#f59e0b',
  secondary: '#6366f1',
};

const fmtShort = (n: number) => {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString();
};

const fmtFull = (n: number) => (n > 0 ? n.toLocaleString() : '-');

interface WorkRevenue {
  work_id: string;
  work_name: string;
  domestic_paid: number;
  global_paid: number;
  domestic_ad: number;
  global_ad: number;
  secondary: number;
  total: number;
  domestic_total: number;
  global_total: number;
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-xl border-none bg-white dark:bg-zinc-900 px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-80 overflow-y-auto">
      <p className="mb-2 text-sm font-semibold tracking-tight">{label}</p>
      {payload.filter(p => p.value > 0).map((p) => (
        <div key={p.name} className="flex items-center gap-2.5 text-xs leading-relaxed py-0.5">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-zinc-500 dark:text-zinc-400">{p.name}</span>
          <span className="ml-auto tabular-nums font-medium">{p.value.toLocaleString()}</span>
        </div>
      ))}
      {payload.filter(p => p.value > 0).length > 1 && (
        <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs font-semibold flex justify-between">
          <span>합계</span>
          <span className="tabular-nums">{total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles = [
    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  ];
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
      rank <= 3 ? styles[rank - 1] : 'text-zinc-400'
    }`}>
      {rank}
    </span>
  );
}

export default function SettlementDashboardPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const { toggleSidebar } = useSidebar();
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [settlements, setSettlements] = useState<RsSettlement[]>([]);
  const [workCount, setWorkCount] = useState(0);
  const [partnerCount, setPartnerCount] = useState(0);
  const [settlementTotal, setSettlementTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    async function load() {
      setLoading(true);
      try {
        const [revRes, settRes, workRes, partnerRes] = await Promise.all([
          settlementFetch(`/api/accounting/settlement/revenue?month=${selectedMonth}`),
          settlementFetch(`/api/accounting/settlement/settlements?month=${selectedMonth}`),
          settlementFetch('/api/accounting/settlement/works'),
          settlementFetch('/api/accounting/settlement/partners'),
        ]);
        const [revData, settData, workData, partnerData] = await Promise.all([
          revRes.json(), settRes.json(), workRes.json(), partnerRes.json(),
        ]);
        const settList: RsSettlement[] = settData.settlements || [];
        setRevenues(revData.revenues || []);
        setSettlements(settList);
        setWorkCount((workData.works || []).length);
        setPartnerCount((partnerData.partners || []).length);
        setSettlementTotal(
          settList.reduce((s, r) => s + Number(r.final_payment), 0)
        );
      } catch (e) {
        console.error('대시보드 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile, selectedMonth]);

  const breakdown = useMemo(() => {
    const b = { domestic_paid: 0, global_paid: 0, domestic_ad: 0, global_ad: 0, secondary: 0, total: 0 };
    for (const r of revenues) {
      for (const k of REVENUE_TYPES) b[k] += Number(r[k]) || 0;
      b.total += Number(r.total) || 0;
    }
    return b;
  }, [revenues]);

  const workRevenues: WorkRevenue[] = useMemo(() =>
    revenues
      .map((r) => ({
        work_id: r.work_id,
        work_name: (r.work as { name?: string } | null)?.name || r.work_id,
        domestic_paid: Number(r.domestic_paid) || 0,
        global_paid: Number(r.global_paid) || 0,
        domestic_ad: Number(r.domestic_ad) || 0,
        global_ad: Number(r.global_ad) || 0,
        secondary: Number(r.secondary) || 0,
        total: Number(r.total) || 0,
        domestic_total: (Number(r.domestic_paid) || 0) + (Number(r.domestic_ad) || 0),
        global_total: (Number(r.global_paid) || 0) + (Number(r.global_ad) || 0),
      }))
      .sort((a, b) => b.total - a.total),
    [revenues]
  );

  const chartData = useMemo(() =>
    workRevenues.slice(0, 10).map((w) => ({
      name: w.work_name.length > 7 ? w.work_name.slice(0, 7) + '…' : w.work_name,
      국내유료: w.domestic_paid,
      글로벌유료: w.global_paid,
      국내광고: w.domestic_ad,
      글로벌광고: w.global_ad,
      '2차사업': w.secondary,
    })),
    [workRevenues]
  );

  const topDomestic = useMemo(() =>
    [...workRevenues].sort((a, b) => b.domestic_total - a.domestic_total).filter(w => w.domestic_total > 0).slice(0, 5),
    [workRevenues]
  );
  const topGlobal = useMemo(() =>
    [...workRevenues].sort((a, b) => b.global_total - a.global_total).filter(w => w.global_total > 0).slice(0, 5),
    [workRevenues]
  );

  const partnerRankings = useMemo(() => {
    const map = new Map<string, { partner_id: string; name: string; revenue_share: number; final_payment: number; work_count: number }>();
    for (const s of settlements) {
      const pid = s.partner_id;
      const name = (s.partner as { name?: string } | null)?.name || pid;
      const existing = map.get(pid);
      if (existing) {
        existing.revenue_share += Number(s.revenue_share) || 0;
        existing.final_payment += Number(s.final_payment) || 0;
        existing.work_count += 1;
      } else {
        map.set(pid, {
          partner_id: pid,
          name,
          revenue_share: Number(s.revenue_share) || 0,
          final_payment: Number(s.final_payment) || 0,
          work_count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.revenue_share - a.revenue_share);
  }, [settlements]);

  if (!profile || !canViewAccounting(profile.role)) return <div className="flex items-center justify-center h-full">Loading...</div>;

  const ready = !loading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">정산</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedMonth} 매출/정산 현황</p>
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { title: '총 매출', value: ready ? fmtShort(breakdown.total) : '–', sub: selectedMonth, icon: TrendingUp, gradient: 'from-emerald-400 to-green-500' },
          { title: '정산 합계', value: ready ? fmtShort(settlementTotal) : '–', sub: '최종 지급액', icon: DollarSign, gradient: 'from-blue-400 to-indigo-500' },
          { title: '등록 작품', value: ready ? `${workCount}개` : '–', sub: undefined, icon: BookOpen, gradient: 'from-violet-400 to-purple-500' },
          { title: '등록 파트너', value: ready ? `${partnerCount}명` : '–', sub: undefined, icon: Users, gradient: 'from-orange-400 to-red-500' },
        ].map((stat) => (
          <div key={stat.title} className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{stat.title}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${stat.gradient}`}>
                <stat.icon className="h-4 w-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{stat.value}</p>
            {stat.sub && <p className="text-[11px] text-zinc-400 mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>

      {/* AI 검색 */}
      <Link
        href="/accounting/settlement/chat"
        className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 px-5 py-4 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-300 group"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/20">
          <MessageCircle className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-tight group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">AI 검색</p>
          <p className="text-xs text-zinc-400">매출, 정산, MG 등을 자연어로 질문하세요</p>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 transition-colors" />
      </Link>

      {/* 매출 유형별 현황 */}
      {ready && breakdown.total > 0 && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold tracking-tight">매출 유형별 현황</h2>
            <span className="text-xs text-zinc-400 tabular-nums">{selectedMonth}</span>
          </div>
          <div className="space-y-3">
            {REVENUE_TYPES.map((key) => {
              const value = breakdown[key];
              const pct = breakdown.total > 0 ? (value / breakdown.total) * 100 : 0;
              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: CHART_HEX[key] }} />
                      <span className="text-zinc-500 dark:text-zinc-400">{REVENUE_TYPE_LABELS[key]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums font-medium">{value > 0 ? fmtFull(value) : '-'}</span>
                      {value > 0 && (
                        <span className="text-[10px] text-zinc-400 tabular-nums">{pct.toFixed(1)}%</span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${Math.max(pct, value > 0 ? 0.5 : 0)}%`, backgroundColor: CHART_HEX[key] }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3 text-sm font-semibold">
              <span>합계</span>
              <span className="tabular-nums">{fmtFull(breakdown.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 차트 + 랭킹 */}
      {ready && chartData.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-5">
          {/* Bar chart */}
          <div className="xl:col-span-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold tracking-tight">작품별 매출 구성</h2>
              <p className="text-xs text-zinc-400 mt-0.5">상위 {Math.min(10, chartData.length)}개 작품</p>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={55}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={48}
                    tickFormatter={(v: number) =>
                      v >= 100_000_000 ? `${(v / 100_000_000).toFixed(0)}억` :
                      v >= 10_000 ? `${Math.round(v / 10_000)}만` : String(v)
                    }
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="국내유료" stackId="a" fill={CHART_HEX.domestic_paid} />
                  <Bar dataKey="글로벌유료" stackId="a" fill={CHART_HEX.global_paid} />
                  <Bar dataKey="국내광고" stackId="a" fill={CHART_HEX.domestic_ad} />
                  <Bar dataKey="글로벌광고" stackId="a" fill={CHART_HEX.global_ad} />
                  <Bar dataKey="2차사업" stackId="a" fill={CHART_HEX.secondary} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rankings */}
          <div className="flex flex-col gap-4 xl:col-span-2">
            {[
              { title: '국내 매출 TOP', data: topDomestic, key: 'domestic_total' as const },
              { title: '글로벌 매출 TOP', data: topGlobal, key: 'global_total' as const },
            ].map(({ title, data, key }) => (
              <div key={title} className="flex-1 rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                </div>
                {data.length === 0 ? (
                  <div className="py-8 text-center text-sm text-zinc-400">데이터 없음</div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.map((w, i) => (
                      <div key={w.work_id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                        <RankBadge rank={i + 1} />
                        <Link href={`/accounting/settlement/works/${w.work_id}`} className="flex-1 truncate text-sm hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                          {w.work_name}
                        </Link>
                        <span className="text-sm font-semibold tabular-nums">{fmtShort(w[key])}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 파트너별 정산 랭킹 */}
      {ready && partnerRankings.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">파트너별 정산</h2>
            <span className="text-xs text-zinc-400 tabular-nums">{selectedMonth}</span>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {partnerRankings.slice(0, 10).map((p, i) => (
              <div key={p.partner_id} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <RankBadge rank={i + 1} />
                <Link href={`/accounting/settlement/partners/${p.partner_id}`} className="flex-1 truncate text-sm hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">
                  {p.name}
                </Link>
                <span className="text-xs text-zinc-400 tabular-nums hidden md:inline">
                  {p.work_count}작품
                </span>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{fmtShort(p.revenue_share)}</div>
                  {p.final_payment !== p.revenue_share && p.final_payment > 0 && (
                    <div className="text-[10px] text-zinc-400 tabular-nums">
                      지급 {fmtShort(p.final_payment)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
