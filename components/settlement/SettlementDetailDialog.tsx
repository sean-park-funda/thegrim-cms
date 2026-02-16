'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsSettlement, SettlementStatus } from '@/lib/types/settlement';

interface SettlementDetailDialogProps {
  settlement: RsSettlement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: { status?: SettlementStatus; production_cost?: number; adjustment?: number; note?: string }) => Promise<void>;
}

export function SettlementDetailDialog({ settlement, open, onOpenChange, onSave }: SettlementDetailDialogProps) {
  const [status, setStatus] = useState<SettlementStatus>(settlement?.status || 'draft');
  const [productionCost, setProductionCost] = useState(String(settlement?.production_cost || 0));
  const [adjustment, setAdjustment] = useState(String(settlement?.adjustment || 0));
  const [note, setNote] = useState(settlement?.note || '');
  const [saving, setSaving] = useState(false);

  if (!settlement) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(settlement.id, {
        status,
        production_cost: Number(productionCost),
        adjustment: Number(adjustment),
        note: note || undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>정산 상세</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">파트너</div>
            <div>{settlement.partner?.name}</div>
            <div className="text-muted-foreground">작품</div>
            <div>{settlement.work?.name}</div>
            <div className="text-muted-foreground">총매출</div>
            <div className="tabular-nums">{Number(settlement.gross_revenue).toLocaleString()}원</div>
            <div className="text-muted-foreground">RS비율</div>
            <div className="tabular-nums">{(Number(settlement.rs_rate) * 100).toFixed(1)}%</div>
            <div className="text-muted-foreground">수익배분</div>
            <div className="tabular-nums">{Number(settlement.revenue_share).toLocaleString()}원</div>
            <div className="text-muted-foreground">세액</div>
            <div className="tabular-nums">{Number(settlement.tax_amount).toLocaleString()}원</div>
            <div className="text-muted-foreground">MG차감</div>
            <div className="tabular-nums">{Number(settlement.mg_deduction).toLocaleString()}원</div>
            <div className="text-muted-foreground">최종지급</div>
            <div className="tabular-nums font-semibold">{Number(settlement.final_payment).toLocaleString()}원</div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <div>
              <Label>상태</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SettlementStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">임시</SelectItem>
                  <SelectItem value="confirmed">확정</SelectItem>
                  <SelectItem value="paid">지급완료</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>제작비</Label>
              <Input type="number" value={productionCost} onChange={(e) => setProductionCost(e.target.value)} />
            </div>
            <div>
              <Label>조정액</Label>
              <Input type="number" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
            </div>
            <div>
              <Label>메모</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
