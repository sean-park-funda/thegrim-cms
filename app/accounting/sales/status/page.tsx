'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Activity, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { fmtShort } from '@/lib/sales/types';

interface FetchLog {
  id: number;
  started_at: string;
  finished_at: string;
  accounts_total: number;
  accounts_success: number;
  accounts_failed: number;
  date_from: string;
  date_to: string;
  error_details: string | null;
}

interface AccountStatus {
  work_name: string;
  latest_date: string;
  total_rows: number;
  latest_amount: number;
}

export default function StatusPage() {
  const { profile } = useStore();
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoading(true);
    settlementFetch('/api/accounting/sales/status')
      .then(r => r.json())
      .then(d => {
        setLogs(d.logs || []);
        setAccounts(d.accounts || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [profile]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">데이터 현황</h1>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">로딩 중...</div>
      ) : (
        <>
          {/* 계정별 데이터 현황 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-cyan-500" />
                작품별 데이터 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-4">작품</th>
                        <th className="text-right py-2 px-3">데이터 수</th>
                        <th className="text-right py-2 px-3">최신 날짜</th>
                        <th className="text-right py-2 pl-3">최신 매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(a => {
                        const isStale = new Date(a.latest_date) < new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
                        return (
                          <tr key={a.work_name} className="border-b last:border-0">
                            <td className="py-2.5 pr-4 font-medium">{a.work_name}</td>
                            <td className="text-right py-2.5 px-3 tabular-nums">{a.total_rows}건</td>
                            <td className="text-right py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 ${isStale ? 'text-yellow-600' : 'text-green-600'}`}>
                                {isStale ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                {a.latest_date}
                              </span>
                            </td>
                            <td className="text-right py-2.5 pl-3 tabular-nums">{fmtShort(a.latest_amount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 수집 로그 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                최근 수집 로그
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">수집 로그가 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {logs.map(log => {
                    const hasErrors = log.accounts_failed > 0;
                    const duration = log.finished_at && log.started_at
                      ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                      : null;
                    return (
                      <div key={log.id} className={`rounded-lg border p-3 ${hasErrors ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-border'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 text-sm">
                            {hasErrors ? (
                              <XCircle className="h-4 w-4 text-yellow-600" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            )}
                            <span className="font-medium">
                              {new Date(log.started_at).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {duration !== null && `${duration}초`}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground ml-6">
                          <span>기간: {log.date_from} ~ {log.date_to}</span>
                          <span className="text-green-600">성공 {log.accounts_success}</span>
                          {log.accounts_failed > 0 && <span className="text-red-500">실패 {log.accounts_failed}</span>}
                          <span>총 {log.accounts_total}</span>
                        </div>
                        {log.error_details && (
                          <pre className="mt-2 ml-6 text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 rounded p-2 overflow-x-auto">
                            {typeof log.error_details === 'string' ? log.error_details : JSON.stringify(JSON.parse(log.error_details as string), null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
