'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementTable } from '@/components/settlement/SettlementTable';
import { SettlementSummaryTable } from '@/components/settlement/SettlementSummaryTable';
import { SettlementDetailDialog } from '@/components/settlement/SettlementDetailDialog';
import { VerificationTable } from '@/components/settlement/VerificationTable';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Download } from 'lucide-react';
import { RsSettlement, SettlementStatus } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

type ViewMode = 'summary' | 'detail' | 'verification';

export default function SettlementsPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [settlements, setSettlements] = useState<RsSettlement[]>([]);
  const [summaryData, setSummaryData] = useState([]);
  const [verificationData, setVerificationData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RsSettlement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');

  const loadSettlements = async () => {
    setLoading(true);
    try {
      const [detailRes, summaryRes, verificationRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/settlements?month=${selectedMonth}`),
        settlementFetch(`/api/accounting/settlement/settlement-summary?month=${selectedMonth}`),
        settlementFetch(`/api/accounting/settlement/verification?month=${selectedMonth}`),
      ]);
      const detailData = await detailRes.json();
      const sumData = await summaryRes.json();
      const veriData = await verificationRes.json();
      setSettlements(detailData.settlements || []);
      setSummaryData(sumData.summary || []);
      setVerificationData(veriData.verification || []);
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

  const handleSelect = (s: RsSettlement) => {
    setSelected(s);
    setDialogOpen(true);
  };

  const handleSave = async (id: string, data: { status?: SettlementStatus; production_cost?: number; note?: string }) => {
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
    const exportTypeMap: Record<ViewMode, string> = {
      summary: 'settlement-summary',
      detail: 'settlement',
      verification: 'verification',
    };
    window.open(`/api/accounting/settlement/export?month=${selectedMonth}&type=${exportTypeMap[viewMode]}`, '_blank');
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const viewModes: { key: ViewMode; label: string }[] = [
    { key: 'summary', label: '집계' },
    { key: 'detail', label: '상세' },
    { key: 'verification', label: 'RS검증' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <CardTitle>정산 내역 ({selectedMonth})</CardTitle>
            <div className="flex rounded-md border overflow-hidden text-sm">
              {viewModes.map((vm) => (
                <button
                  key={vm.key}
                  onClick={() => setViewMode(vm.key)}
                  className={`px-3 py-1 ${viewMode === vm.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {vm.label}
                </button>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            엑셀 내보내기
          </Button>
        </CardHeader>
        <CardContent>
          {viewMode === 'summary' && (
            <SettlementSummaryTable data={summaryData} loading={loading} />
          )}
          {viewMode === 'detail' && (
            <SettlementTable settlements={settlements} loading={loading} onSelect={handleSelect} />
          )}
          {viewMode === 'verification' && (
            <VerificationTable data={verificationData} loading={loading} />
          )}
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
