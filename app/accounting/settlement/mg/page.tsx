'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { RsMgBalance, RsWork, RsPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

export default function MgPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [balances, setBalances] = useState<RsMgBalance[]>([]);
  const [works, setWorks] = useState<RsWork[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formWorkId, setFormWorkId] = useState('');
  const [formPartnerId, setFormPartnerId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const load = async () => {
    setLoading(true);
    try {
      const [mgRes, workRes, partnerRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/mg?month=${selectedMonth}`),
        settlementFetch('/api/accounting/settlement/works'),
        settlementFetch('/api/accounting/settlement/partners'),
      ]);
      const mgData = await mgRes.json();
      const workData = await workRes.json();
      const partnerData = await partnerRes.json();
      setBalances(mgData.mg_balances || []);
      setWorks(workData.works || []);
      setPartners(partnerData.partners || []);
    } catch (e) {
      console.error('MG 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    load();
  }, [profile, selectedMonth]);

  const handleAdd = async () => {
    if (!formWorkId || !formPartnerId || !formAmount) return;
    setSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/mg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          work_id: formWorkId,
          partner_id: formPartnerId,
          mg_added: Number(formAmount),
          note: formNote || undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setFormWorkId('');
        setFormPartnerId('');
        setFormAmount('');
        setFormNote('');
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <SettlementHeader />

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>MG 잔액 관리 ({selectedMonth})</CardTitle>
          {canManage && (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              MG 추가
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : balances.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">MG 잔액 데이터가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">파트너</th>
                    <th className="py-2 px-3 font-medium">작품</th>
                    <th className="py-2 px-3 font-medium text-right">이전 잔액</th>
                    <th className="py-2 px-3 font-medium text-right">추가</th>
                    <th className="py-2 px-3 font-medium text-right">차감</th>
                    <th className="py-2 px-3 font-medium text-right">현재 잔액</th>
                    <th className="py-2 px-3 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">{b.partner?.name || b.partner_id}</td>
                      <td className="py-2 px-3">{b.work?.name || b.work_id}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{Number(b.previous_balance).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-green-600">{Number(b.mg_added).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-red-600">{Number(b.mg_deducted).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">{Number(b.current_balance).toLocaleString()}</td>
                      <td className="py-2 px-3 text-muted-foreground">{b.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>MG 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>작품</Label>
              <Select value={formWorkId} onValueChange={setFormWorkId}>
                <SelectTrigger>
                  <SelectValue placeholder="작품 선택" />
                </SelectTrigger>
                <SelectContent>
                  {works.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>파트너</Label>
              <Select value={formPartnerId} onValueChange={setFormPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="파트너 선택" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>MG 금액</Label>
              <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>메모</Label>
              <Input value={formNote} onChange={(e) => setFormNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleAdd} disabled={saving || !formWorkId || !formPartnerId || !formAmount}>
                {saving ? '저장 중...' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
