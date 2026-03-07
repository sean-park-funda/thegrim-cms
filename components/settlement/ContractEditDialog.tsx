'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RsWorkPartner, RevenueType } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { Checkbox } from '@/components/ui/checkbox';

const ALL_REVENUE_TYPES: RevenueType[] = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];
const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  domestic_paid: '국내유료수익',
  global_paid: '글로벌유료수익',
  domestic_ad: '국내 광고',
  global_ad: '글로벌 광고',
  secondary: '2차 사업',
};

interface Props {
  wp: RsWorkPartner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ContractEditDialog({ wp, open, onOpenChange, onSaved }: Props) {
  const [rsRate, setRsRate] = useState('');
  const [vatType, setVatType] = useState('');
  const [mgRsRate, setMgRsRate] = useState('');
  const [contractCategory, setContractCategory] = useState('');
  const [includedRevenueTypes, setIncludedRevenueTypes] = useState<RevenueType[]>(ALL_REVENUE_TYPES);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wp) {
      setRsRate(wp.rs_rate != null ? String(wp.rs_rate * 100) : '');
      setVatType(wp.vat_type || '');
      setMgRsRate(wp.mg_rs_rate != null ? String(wp.mg_rs_rate * 100) : '');
      setContractCategory(wp.contract_category || '');
      setIncludedRevenueTypes(wp.included_revenue_types || ALL_REVENUE_TYPES);
    }
  }, [wp]);

  const handleSave = async () => {
    if (!wp) return;
    setSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/work-partners', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: wp.id,
          rs_rate: rsRate ? Number(rsRate) / 100 : wp.rs_rate,
          role: wp.role,
          is_mg_applied: wp.is_mg_applied,
          note: wp.note,
          vat_type: vatType || null,
          mg_rs_rate: mgRsRate ? Number(mgRsRate) / 100 : null,
          contract_category: contractCategory || null,
          included_revenue_types: includedRevenueTypes,
        }),
      });
      if (res.ok) {
        onOpenChange(false);
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            계약 정보 수정 — {wp?.work?.name} / {wp?.partner?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>RS 요율 (%)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" step="1" min="0" max="100" value={rsRate} onChange={(e) => setRsRate(e.target.value)} className="w-28" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label>MG RS 요율 (%)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" step="1" min="0" max="100" value={mgRsRate} onChange={(e) => setMgRsRate(e.target.value)} className="w-28" placeholder="미설정" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">MG 적용 시 사용되는 별도 요율</p>
          </div>
          <div>
            <Label>부가세 유형</Label>
            <Input value={vatType} onChange={(e) => setVatType(e.target.value)} placeholder="과세/면세/협의중" />
          </div>
          <div>
            <Label>계약구분</Label>
            <Input value={contractCategory} onChange={(e) => setContractCategory(e.target.value)} placeholder="RS/MG/신규/갱신" />
          </div>
          <div className="col-span-2">
            <Label className="mb-2 block">정산 대상 수익유형</Label>
            <div className="flex flex-wrap gap-3">
              {ALL_REVENUE_TYPES.map(type => (
                <label key={type} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={includedRevenueTypes.includes(type)}
                    onCheckedChange={(checked) => {
                      setIncludedRevenueTypes(prev => {
                        if (checked) return [...prev, type];
                        const next = prev.filter(t => t !== type);
                        return next.length > 0 ? next : prev;
                      });
                    }}
                  />
                  {REVENUE_TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
