'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, TrendingDown, BarChart3, Calculator } from 'lucide-react';

export default function AccountingPage() {
  const router = useRouter();
  const { profile } = useStore();
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    transactionCount: 0
  });

  useEffect(() => {
    // 권한 체크
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
      return;
    }

    // TODO: 실제 데이터 로드
    // fetchAccountingStats().then(setStats);
  }, [profile, router]);

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">회계 관리</h1>
        <Button onClick={() => router.push('/accounting/transactions')}>
          거래 내역 보기
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 수입</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ₩{stats.totalIncome.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 지출</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              ₩{stats.totalExpense.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">잔액</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              ₩{stats.balance.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">거래 건수</CardTitle>
            <BarChart3 className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {stats.transactionCount}건
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RS 정산 시스템 */}
      <Card className="border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            RS 정산 시스템
          </CardTitle>
          <Button onClick={() => router.push('/accounting/settlement')}>
            정산 관리로 이동
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            네이버 매출 엑셀 업로드 → 작품별 수익 집계 → 파트너별 RS 정산을 자동으로 처리합니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/accounting/settlement/upload')}>
              엑셀 업로드
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/accounting/settlement/revenue')}>
              수익 조회
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/accounting/settlement/settlements')}>
              정산 내역
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/accounting/settlement/works')}>
              작품 관리
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/accounting/settlement/partners')}>
              파트너 관리
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 안내 메시지 */}
      <Card>
        <CardHeader>
          <CardTitle>회계 시스템 v1.0</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            더그림 CMS 회계 시스템이 추가되었습니다. 다음 기능이 곧 제공될 예정입니다:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground">
            <li>수입/지출 거래 내역 관리</li>
            <li>프로젝트별 예산 설정 및 추적</li>
            <li>월별/카테고리별 재무 보고서</li>
            <li>웹툰별 수익/비용 분석</li>
          </ul>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" disabled>
              거래 내역 관리 (준비 중)
            </Button>
            <Button variant="outline" disabled>
              예산 관리 (준비 중)
            </Button>
            <Button variant="outline" disabled>
              보고서 (준비 중)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
