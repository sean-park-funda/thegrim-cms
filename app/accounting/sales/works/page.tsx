'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, fmtWon, getDateRange } from '@/lib/sales/types';
import { TrendingUp, TrendingDown, Calendar, Zap } from 'lucide-react';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function WorksPage() {
  const { profile } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workParam = searchParams.get('work');

  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedWork, setSelectedWork] = useState<string>(workParam || '');

  const { from, to } = useMemo(() => getDateRange(days), [days]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoading(true);
    settlementFetch(`/api/accounting/sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => {
        setData(d);
        if (!selectedWork && d.summary?.workTotals?.[0]) {
          setSelectedWork(d.summary.workTotals[0].name);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  const workNames = data?.summary?.workTotals?.map(w => w.name) || [];
  const workData = selectedWork && data?.works[selectedWork] ? data.works[selectedWork] : [];

  // 요일별 평균
  const dayOfWeekData = useMemo(() => {
    const dayMap: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const row of workData) {
      const d = new Date(row.date);
      dayMap[d.getDay()].push(row.amount);
    }
    return DAY_NAMES.map((name, i) => ({
      day: name,
      avg: dayMap[i].length > 0 ? Math.round(dayMap[i].reduce((a, b) => a + b, 0) / dayMap[i].length) : 0,
      count: dayMap[i].length,
    }));
  }, [workData]);

  // 통계
  const stats = useMemo(() => {
    if (!workData.length) return null;
    const amounts = workData.map(r => r.amount);
    const total = amounts.reduce((a, b) => a + b, 0);
    const avg = total / amounts.length;
    const maxIdx = amounts.indexOf(Math.max(...amounts));
    const minIdx = amounts.indexOf(Math.min(...amounts));
    const peakDay = dayOfWeekData.reduce((best, cur) => cur.avg > best.avg ? cur : best, dayOfWeekData[0]);
    return { total, avg, max: workData[maxIdx], min: workData[minIdx], peakDay };
  }, [workData, dayOfWeekData]);

  const chartData = workData.map(r => ({ date: r.date.slice(5), amount: r.amount }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">작품별 매출</h1>
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
      ) : (
        <>
          {/* 작품 선택 */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                {workNames.map((name, i) => (
                  <Button
                    key={name}
                    variant={selectedWork === name ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs"
                    style={selectedWork === name ? { backgroundColor: WORK_COLORS[i % WORK_COLORS.length] } : {}}
                    onClick={() => setSelectedWork(name)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {stats && (
            <>
              {/* 통계 카드 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">기간 총 매출</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{fmtShort(stats.total)}</div>
                    <p className="text-xs text-muted-foreground">일평균 {fmtShort(stats.avg)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">최고 매출일</CardTitle>
                    <Zap className="h-4 w-4 text-yellow-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{fmtShort(stats.max.amount)}</div>
                    <p className="text-xs text-muted-foreground">{stats.max.date}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">최저 매출일</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{fmtShort(stats.min.amount)}</div>
                    <p className="text-xs text-muted-foreground">{stats.min.date}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">피크 요일</CardTitle>
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-xl font-bold">{stats.peakDay.day}요일</div>
                    <p className="text-xs text-muted-foreground">평균 {fmtShort(stats.peakDay.avg)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* 일별 추이 */}
              <Card>
                <CardHeader>
                  <CardTitle>{selectedWork} - 일별 추이</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="stroke-border" />
                        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="stroke-border" />
                        <Tooltip formatter={(value) => [fmtWon(Number(value)), '매출']} />
                        <Line type="monotone" dataKey="amount" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* 요일별 평균 */}
              <Card>
                <CardHeader>
                  <CardTitle>요일별 평균 매출</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayOfWeekData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} className="stroke-border" />
                        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="stroke-border" />
                        <Tooltip formatter={(value) => [fmtWon(Number(value)), '평균 매출']} />
                        <Bar dataKey="avg" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
