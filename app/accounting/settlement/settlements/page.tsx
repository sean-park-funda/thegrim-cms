'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { MonthSelector } from '@/components/settlement/MonthSelector';
import { SettlementTable } from '@/components/settlement/SettlementTable';
import { SettlementDetailDialog } from '@/components/settlement/SettlementDetailDialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Calculator, Download } from 'lucide-react';
import { RsSettlement, SettlementStatus } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

export default function SettlementsPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [settlements, setSettlements] = useState<RsSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [selected, setSelected] = useState<RsSettlement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const loadSettlements = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch(`/api/accounting/settlement/settlements?month=${selectedMonth}`);
      const data = await res.json();
      setSettlements(data.settlements || []);
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

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadSettlements();
      } else {
        alert(data.error || '정산 계산 실패');
      }
    } catch {
      alert('정산 계산 중 오류가 발생했습니다.');
    } finally {
      setCalculating(false);
    }
  };

  const handleSelect = (s: RsSettlement) => {
    setSelected(s);
    setDialogOpen(true);
  };

  const handleSave = async (id: string, data: { status?: SettlementStatus; production_cost?: number; adjustment?: number; note?: string }) => {
    const res = await settlementFetch('/api/accounting/settlement/settlements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    });
    if (res.ok) {
      await loadSettlements();
    }
  };

  const handleExport = () => {
    window.open(`/api/accounting/settlement/export?month=${selectedMonth}&type=settlement`, '_blank');
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">RS 정산</h1>
        <MonthSelector />
      </div>

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>정산 내역 ({selectedMonth})</CardTitle>
          <div className="flex gap-2">
            {canManage && (
              <Button onClick={handleCalculate} disabled={calculating}>
                <Calculator className="h-4 w-4 mr-1" />
                {calculating ? '계산 중...' : '정산 계산'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} disabled={settlements.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              엑셀 내보내기
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <SettlementTable settlements={settlements} loading={loading} onSelect={handleSelect} />
        </CardContent>
      </Card>

      <SettlementDetailDialog
        settlement={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}
