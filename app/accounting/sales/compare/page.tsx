'use client';

import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { DailySalesData, WORK_COLORS, PRESETS, fmtShort, fmtWon, getDateRange } from '@/lib/sales/types';

export default function ComparePage() {
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
          setSelectedWorks(new Set(d.summary.workTotals.slice(0, 3).map(w => w.name)));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  const workNames = data?.summary?.workTotals?.map(w => w.name) || [];

  const toggleWork = (name: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else if (next.size < 5) next.add(name);
      return next;
    });
  };

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

  // 비교 테이블 데이터
  const compareTable = useMemo(() => {
    if (!data) return [];
    return Array.from(selectedWorks).map(name => {
      const rows = data.works[name] || [];
      const amounts = rows.map(r => r.amount);
      const total = amounts.reduce((a, b) => a + b, 0);
      const avg = amounts.length ? total / amounts.length : 0;
      const max = Math.max(...amounts, 0);
      const min = amounts.length ? Math.min(...amounts) : 0;
      const maxDate = rows.find(r => r.amount === max)?.date || '';
      return { name, total, avg, max, min, maxDate, days: amounts.length };
    }).sort((a, b) => b.total - a.total);
  }, [data, selectedWorks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">비교 분석</h1>
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
          {/* 작품 선택 (최대 5개) */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">작품 선택 (최대 5개)</CardTitle>
                <span className="text-xs text-muted-foreground">{selectedWorks.size}/5 선택</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {workNames.map((name, i) => (
                  <Button
                    key={name}
                    variant={selectedWorks.has(name) ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs"
                    style={selectedWorks.has(name) ? { backgroundColor: WORK_COLORS[i % WORK_COLORS.length] } : {}}
                    onClick={() => toggleWork(name)}
                    disabled={!selectedWorks.has(name) && selectedWorks.size >= 5}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedWorks.size > 0 && (
            <>
              {/* 겹쳐보기 차트 */}
              <Card>
                <CardHeader>
                  <CardTitle>매출 추이 비교</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} className="stroke-border" />
                        <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="stroke-border" />
                        <Tooltip formatter={(value) => [fmtWon(Number(value)), '']} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                        {Array.from(selectedWorks).map((name) => (
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

              {/* 비교 테이블 */}
              <Card>
                <CardHeader>
                  <CardTitle>상세 비교</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-2 pr-4">작품</th>
                          <th className="text-right py-2 px-3">총 매출</th>
                          <th className="text-right py-2 px-3">일 평균</th>
                          <th className="text-right py-2 px-3">최고</th>
                          <th className="text-right py-2 px-3">최저</th>
                          <th className="text-right py-2 pl-3">최고 매출일</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareTable.map((row, i) => (
                          <tr key={row.name} className="border-b last:border-0">
                            <td className="py-2.5 pr-4">
                              <div className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: WORK_COLORS[workNames.indexOf(row.name) % WORK_COLORS.length] }} />
                                <span className="font-medium truncate max-w-40">{row.name}</span>
                              </div>
                            </td>
                            <td className="text-right py-2.5 px-3 tabular-nums font-semibold">{fmtShort(row.total)}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums">{fmtShort(row.avg)}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums text-green-600">{fmtShort(row.max)}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums text-red-500">{fmtShort(row.min)}</td>
                            <td className="text-right py-2.5 pl-3 text-muted-foreground">{row.maxDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
