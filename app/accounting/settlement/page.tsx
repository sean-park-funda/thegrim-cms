'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { MonthSelector } from '@/components/settlement/MonthSelector';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DollarSign, Users, BookOpen, TrendingUp } from 'lucide-react';

interface DashboardStats {
  totalRevenue: number;
  workCount: number;
  partnerCount: number;
  settlementTotal: number;
}

export default function SettlementDashboardPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [stats, setStats] = useState<DashboardStats>({ totalRevenue: 0, workCount: 0, partnerCount: 0, settlementTotal: 0 });
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
          fetch(`/api/accounting/settlement/revenue?month=${selectedMonth}`),
          fetch(`/api/accounting/settlement/settlements?month=${selectedMonth}`),
          fetch('/api/accounting/settlement/works'),
          fetch('/api/accounting/settlement/partners'),
        ]);

        const revData = await revRes.json();
        const settData = await settRes.json();
        const workData = await workRes.json();
        const partnerData = await partnerRes.json();

        const totalRevenue = (revData.revenues || []).reduce((s: number, r: { total: number }) => s + Number(r.total), 0);
        const settlementTotal = (settData.settlements || []).reduce((s: number, r: { final_payment: number }) => s + Number(r.final_payment), 0);

        setStats({
          totalRevenue,
          workCount: (workData.works || []).length,
          partnerCount: (partnerData.partners || []).length,
          settlementTotal,
        });
      } catch (e) {
        console.error('대시보드 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 매출</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? '...' : `${stats.totalRevenue.toLocaleString()}원`}
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
              {loading ? '...' : `${stats.settlementTotal.toLocaleString()}원`}
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
              {loading ? '...' : `${stats.workCount}개`}
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
              {loading ? '...' : `${stats.partnerCount}명`}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
