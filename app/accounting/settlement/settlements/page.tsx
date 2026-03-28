'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementSummaryTable } from '@/components/settlement/SettlementSummaryTable';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Download } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';

export default function SettlementsPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [summaryData, setSummaryData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadSettlements = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch(`/api/accounting/settlement/settlement-list?month=${selectedMonth}`);
      const data = await res.json();
      setSummaryData(data.summary || []);
    } catch (e) {
      console.error('정산 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    loadSettlements();
  }, [profile, selectedMonth]);

  const handleExport = () => {
    window.open(`/api/accounting/settlement/export?month=${selectedMonth}&type=settlement-summary`, '_blank');
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <CardTitle>정산 내역 ({selectedMonth})</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            엑셀 내보내기
          </Button>
        </CardHeader>
        <CardContent>
          <SettlementSummaryTable data={summaryData} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}
