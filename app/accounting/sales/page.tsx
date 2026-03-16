'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, BookOpen, Crown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, getDateRange } from '@/lib/sales/types';

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 shadow-xl max-h-80 overflow-y-auto">
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      {payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value).map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs leading-relaxed">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground truncate max-w-32">{p.name}</span>
          <span className="ml-auto tabular-nums font-medium">{fmtShort(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1.5 pt-1.5 border-t text-xs font-semibold flex justify-between">
          <span>합계</span>
          <span className="tabular-nums">{fmtShort(total)}</span>
        </div>
      )}
    </div>
  );
}

export default function SalesDashboardPage() {
  const { profile } = useStore();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => {
        setData(d);
        if (d.summary?.workTotals) {
          setSelectedWorks(new Set(d.summary.workTotals.slice(0, 5).map(w => w.name)));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  const chartData = useMemo(() => {
    if (!data?.summary?.dailyTotals) return [];
    return data.summary.dailyTotals.map(({ date }) => {
      const point: Record<string, string | number> = { date: date.slice(5) };
      for (const [workName, rows] of Object.entries(data.works)) {
        if (selectedWorks.has(workName)) {
          const row = rows.find(r => r.date === date);
          point[workName] = row ? row.amount : 0;
        }
      }
      return point;
    });
  }, [data, selectedWorks]);

  const workNames = useMemo(() =>
    data?.summary?.workTotals?.map(w => w.name) || [],
  [data]);

  const toggleWork = (name: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">일별 매출 추이</h1>
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <Button key={p.days} variant={days === p.days ? 'default' : 'outline'} size="sm" onClick={() => setDays(p.days)}>
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">로딩 중...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">데이터 없음</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">총 매출</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtShort(data.summary.totalSales)}</div>
                <p className="text-xs text-muted-foreground">{days}일간</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">일 평균</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtShort(data.summary.dailyAverage)}</div>
                <p className="text-xs text-muted-foreground">하루 평균 매출</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">작품 수</CardTitle>
                <BookOpen className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.workCount}개</div>
                <p className="text-xs text-muted-foreground">매출 발생 작품</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">1위 작품</CardTitle>
                <Crown className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold truncate">{data.summary.topWork?.name || '-'}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.topWork ? fmtShort(data.summary.topWork.total) : '-'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 차트 + 작품 선택 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>일별 매출 추이</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedWorks(new Set(workNames))}>전체 선택</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedWorks(new Set())}>전체 해제</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {workNames.map((name, i) => (
                  <Button
                    key={name}
                    variant={selectedWorks.has(name) ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7"
                    style={selectedWorks.has(name) ? { backgroundColor: WORK_COLORS[i % WORK_COLORS.length] } : {}}
                    onClick={() => toggleWork(name)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="stroke-border" />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="stroke-border" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    {workNames.filter(n => selectedWorks.has(n)).map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={WORK_COLORS[workNames.indexOf(name) % WORK_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 작품별 매출 순위 */}
          <Card>
            <CardHeader>
              <CardTitle>작품별 매출 순위 ({days}일)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.summary.workTotals.map((w, i) => {
                  const ratio = data.summary.workTotals[0]?.total
                    ? (w.total / data.summary.workTotals[0].total) * 100
                    : 0;
                  return (
                    <div key={w.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-6 text-right text-muted-foreground">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{w.name}</span>
                          <span className="text-sm tabular-nums">{fmtShort(w.total)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ratio}%`,
                              backgroundColor: WORK_COLORS[i % WORK_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
