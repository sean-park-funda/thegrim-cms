'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { MonthSelector } from '@/components/settlement/MonthSelector';
import { RevenueUploadForm } from '@/components/settlement/RevenueUploadForm';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { RsUploadHistory } from '@/lib/types/settlement';

const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료',
  global_paid: '글로벌유료',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

export default function UploadPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [history, setHistory] = useState<RsUploadHistory[]>([]);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const loadHistory = async () => {
    try {
      // Upload history doesn't have a dedicated endpoint, so we'll use a simple approach
      // For now, history is tracked in the upload result display
    } catch (e) {
      console.error('이력 로드 오류:', e);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      loadHistory();
    }
  }, [profile, selectedMonth]);

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">RS 정산</h1>
        <MonthSelector />
      </div>

      <SettlementNav />

      <Card>
        <CardHeader>
          <CardTitle>엑셀 업로드</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            네이버 매출 엑셀 파일을 업로드하면 자동으로 파싱하여 작품별 수익을 집계합니다.
            대상 월: <span className="font-semibold">{selectedMonth}</span>
          </p>
          <RevenueUploadForm onUploadComplete={loadHistory} />
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>업로드 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">날짜</th>
                  <th className="py-2 px-3 font-medium">유형</th>
                  <th className="py-2 px-3 font-medium">파일명</th>
                  <th className="py-2 px-3 font-medium text-right">총액</th>
                  <th className="py-2 px-3 font-medium text-right">매칭</th>
                  <th className="py-2 px-3 font-medium text-right">미매칭</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b">
                    <td className="py-2 px-3">{new Date(h.created_at).toLocaleDateString()}</td>
                    <td className="py-2 px-3">{REVENUE_TYPE_LABELS[h.revenue_type] || h.revenue_type}</td>
                    <td className="py-2 px-3 truncate max-w-[200px]">{h.file_name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{Number(h.total_amount).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{h.matched_count}</td>
                    <td className="py-2 px-3 text-right">{h.unmatched_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
