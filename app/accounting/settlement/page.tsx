'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Users, BookOpen, TrendingUp, BarChart3 } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';
import { RsRevenue } from '@/lib/types/settlement';
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

const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료',
  global_paid: '글로벌유료',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

const REVENUE_TYPE_COLORS: Record<string, string> = {
  domestic_paid: '#2563eb',
  global_paid: '#7c3aed',
  domestic_ad: '#059669',
  global_ad: '#d97706',
  secondary: '#dc2626',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : '-');

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

// Custom tooltip for the chart
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.filter(p => p.value > 0).map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function SettlementDashboardPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [workCount, setWorkCount] = useState(0);
  const [partnerCount, setPartnerCount] = useState(0);
  const [settlementTotal, setSettlementTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

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

        const revData = await revRes.json();
        const settData = await settRes.json();
        const workData = await workRes.json();
        const partnerData = await partnerRes.json();

        setRevenues(revData.revenues || []);
        setWorkCount((workData.works || []).length);
        setPartnerCount((partnerData.partners || []).length);
        setSettlementTotal(
          (settData.settlements || []).reduce((s: number, r: { final_payment: number }) => s + Number(r.final_payment), 0)
        );
      } catch (e) {
        console.error('대시보드 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, selectedMonth]);

  // Revenue breakdown by type
  const revenueBreakdown = useMemo(() => {
    const breakdown = {
      domestic_paid: 0, global_paid: 0, domestic_ad: 0, global_ad: 0, secondary: 0, total: 0,
    };
    for (const r of revenues) {
      breakdown.domestic_paid += Number(r.domestic_paid) || 0;
      breakdown.global_paid += Number(r.global_paid) || 0;
      breakdown.domestic_ad += Number(r.domestic_ad) || 0;
      breakdown.global_ad += Number(r.global_ad) || 0;
      breakdown.secondary += Number(r.secondary) || 0;
      breakdown.total += Number(r.total) || 0;
    }
    return breakdown;
  }, [revenues]);

  // Per-work revenue for chart & rankings
  const workRevenues: WorkRevenue[] = useMemo(() => {
    return revenues
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
      .sort((a, b) => b.total - a.total);
  }, [revenues]);

  // Chart data: top 10 works
  const chartData = useMemo(() => {
    return workRevenues.slice(0, 10).map((w) => ({
      name: w.work_name.length > 8 ? w.work_name.slice(0, 8) + '…' : w.work_name,
      국내유료: w.domestic_paid,
      글로벌유료: w.global_paid,
      국내광고: w.domestic_ad,
      글로벌광고: w.global_ad,
      '2차사업': w.secondary,
    }));
  }, [workRevenues]);

  // Top domestic / global rankings
  const topDomestic = useMemo(() =>
    [...workRevenues].sort((a, b) => b.domestic_total - a.domestic_total).slice(0, 5),
    [workRevenues]
  );
  const topGlobal = useMemo(() =>
    [...workRevenues].sort((a, b) => b.global_total - a.global_total).slice(0, 5),
    [workRevenues]
  );

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-6">
      <SettlementHeader />
      <SettlementNav />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 매출</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? '...' : `${revenueBreakdown.total.toLocaleString()}원`}
            </div>
            <p className="text-xs text-muted-foreground">{selectedMonth}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">정산 합계</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {loading ? '...' : `${settlementTotal.toLocaleString()}원`}
            </div>
            <p className="text-xs text-muted-foreground">최종 지급액</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">등록 작품</CardTitle>
            <BookOpen className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {loading ? '...' : `${workCount}개`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">등록 파트너</CardTitle>
            <Users className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {loading ? '...' : `${partnerCount}명`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue breakdown by type */}
      {!loading && revenueBreakdown.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">매출 유형별 분류 — {selectedMonth}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {(Object.keys(REVENUE_TYPE_LABELS) as Array<keyof typeof REVENUE_TYPE_LABELS>).map((key) => {
                const val = revenueBreakdown[key as keyof typeof revenueBreakdown];
                const pct = revenueBreakdown.total > 0 ? ((val / revenueBreakdown.total) * 100).toFixed(1) : '0';
                return (
                  <div key={key} className="text-center">
                    <div className="text-xs text-muted-foreground mb-1">{REVENUE_TYPE_LABELS[key]}</div>
                    <div className="text-lg font-bold tabular-nums">{val > 0 ? val.toLocaleString() : '-'}</div>
                    {val > 0 && (
                      <div className="mt-1">
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: REVENUE_TYPE_COLORS[key] }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{pct}%</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue chart by work */}
      {!loading && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <CardTitle className="text-base">작품별 매출 — {selectedMonth}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="국내유료" stackId="a" fill="#2563eb" />
                  <Bar dataKey="글로벌유료" stackId="a" fill="#7c3aed" />
                  <Bar dataKey="국내광고" stackId="a" fill="#059669" />
                  <Bar dataKey="글로벌광고" stackId="a" fill="#d97706" />
                  <Bar dataKey="2차사업" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rankings: domestic & global side by side */}
      {!loading && workRevenues.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Domestic ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">국내 매출 TOP 5</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 px-2 font-medium w-8">#</th>
                    <th className="py-1.5 px-2 font-medium">작품</th>
                    <th className="py-1.5 px-2 font-medium text-right">유료</th>
                    <th className="py-1.5 px-2 font-medium text-right">광고</th>
                    <th className="py-1.5 px-2 font-medium text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {topDomestic.map((w, i) => (
                    <tr key={w.work_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5 px-2">
                        <Badge variant={i < 3 ? 'default' : 'secondary'} className="w-6 h-6 p-0 justify-center text-xs">
                          {i + 1}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2">
                        <Link href={`/accounting/settlement/works/${w.work_id}`} className="text-primary hover:underline text-xs">
                          {w.work_name}
                        </Link>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-xs">{fmt(w.domestic_paid)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-xs">{fmt(w.domestic_ad)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-xs">{fmt(w.domestic_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Global ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">글로벌 매출 TOP 5</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 px-2 font-medium w-8">#</th>
                    <th className="py-1.5 px-2 font-medium">작품</th>
                    <th className="py-1.5 px-2 font-medium text-right">유료</th>
                    <th className="py-1.5 px-2 font-medium text-right">광고</th>
                    <th className="py-1.5 px-2 font-medium text-right">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {topGlobal.map((w, i) => (
                    <tr key={w.work_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-1.5 px-2">
                        <Badge variant={i < 3 ? 'default' : 'secondary'} className="w-6 h-6 p-0 justify-center text-xs">
                          {i + 1}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-2">
                        <Link href={`/accounting/settlement/works/${w.work_id}`} className="text-primary hover:underline text-xs">
                          {w.work_name}
                        </Link>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-xs">{fmt(w.global_paid)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-xs">{fmt(w.global_ad)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-xs">{fmt(w.global_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
