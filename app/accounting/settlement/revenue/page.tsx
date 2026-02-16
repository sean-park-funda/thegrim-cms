'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { RevenueTable } from '@/components/settlement/RevenueTable';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Download, Search } from 'lucide-react';
import { RsRevenue } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

export default function RevenuePage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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
        const res = await settlementFetch(`/api/accounting/settlement/revenue?month=${selectedMonth}`);
        const data = await res.json();
        setRevenues(data.revenues || []);
      } catch (e) {
        console.error('수익 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, selectedMonth]);

  const handleExport = () => {
    window.open(`/api/accounting/settlement/export?month=${selectedMonth}&type=revenue`, '_blank');
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <SettlementHeader />

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>작품별 수익 ({selectedMonth})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="작품 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-48"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={revenues.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              엑셀 내보내기
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <RevenueTable revenues={revenues} loading={loading} search={search} />
        </CardContent>
      </Card>
    </div>
  );
}
