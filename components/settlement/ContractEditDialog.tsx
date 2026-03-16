'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RsWorkPartner, RevenueType } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { Percent, ListChecks, Settings } from 'lucide-react';

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
  const [revenueRate, setRevenueRate] = useState('1');
  const [settlementCycle, setSettlementCycle] = useState('monthly');
  const [laborCostExcluded, setLaborCostExcluded] = useState(false);
  const [taxType, setTaxType] = useState('standard');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (wp && open) {
      setRsRate(wp.rs_rate != null ? String(wp.rs_rate * 100) : '');
      setVatType(wp.vat_type || '');
      setMgRsRate(wp.mg_rs_rate != null ? String(wp.mg_rs_rate * 100) : '');
      setContractCategory(wp.contract_category || '');
      setIncludedRevenueTypes(wp.included_revenue_types || ALL_REVENUE_TYPES);
      setRevenueRate(wp.revenue_rate != null ? String(wp.revenue_rate) : '1');
      setSettlementCycle(wp.settlement_cycle || 'monthly');
      setLaborCostExcluded(wp.labor_cost_excluded ?? false);
      setTaxType(wp.tax_type || 'standard');
    }
  }, [wp, open]);

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
          labor_cost_excluded: laborCostExcluded,
          revenue_rate: revenueRate ? Number(revenueRate) : 1,
          settlement_cycle: settlementCycle,
          tax_type: taxType,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 py-5 border-b bg-muted/40">
          <SheetTitle className="text-lg">계약 정보 수정</SheetTitle>
          <SheetDescription>
            {wp?.work?.name} / {wp?.partner?.name}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 수익 배분율 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Percent className="h-4 w-4 text-primary" />
              수익 배분율
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ce-rs" className="text-xs text-muted-foreground">RS 요율 (%)</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input id="ce-rs" type="number" step="1" min="0" max="100" value={rsRate} onChange={e => setRsRate(e.target.value)} />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="ce-mgrs" className="text-xs text-muted-foreground">MG RS 요율 (%)</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input id="ce-mgrs" type="number" step="1" min="0" max="100" value={mgRsRate} onChange={e => setMgRsRate(e.target.value)} placeholder="미설정" />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">MG 적용 시 사용되는 별도 요율</p>
                </div>
              </div>
              <div>
                <Label htmlFor="ce-revrate" className="text-xs text-muted-foreground">매출액 적용율</Label>
                <Input id="ce-revrate" type="number" step="0.01" min="0" max="1" value={revenueRate} onChange={e => setRevenueRate(e.target.value)} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">매출액에 먼저 곱해지는 비율 (기본 1)</p>
              </div>
            </div>
          </section>

          {/* 계약 조건 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4 text-primary" />
              계약 조건
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">정산주기</Label>
                  <Select value={settlementCycle} onValueChange={setSettlementCycle}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">매월</SelectItem>
                      <SelectItem value="semi_annual">반기</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="ce-vat" className="text-xs text-muted-foreground">부가세 유형</Label>
                  <Input id="ce-vat" value={vatType} onChange={e => setVatType(e.target.value)} placeholder="과세/면세/협의중" className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ce-cat" className="text-xs text-muted-foreground">계약구분</Label>
                  <Input id="ce-cat" value={contractCategory} onChange={e => setContractCategory(e.target.value)} placeholder="RS/MG/신규/갱신" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">세금유형</Label>
                  <Select value={taxType} onValueChange={setTaxType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">기본</SelectItem>
                      <SelectItem value="royalty">사용료소득</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted/80 transition-colors">
                <Checkbox
                  checked={laborCostExcluded}
                  onCheckedChange={(checked) => setLaborCostExcluded(!!checked)}
                />
                <div>
                  <span className="text-sm">인건비공제제외</span>
                  <p className="text-[11px] text-muted-foreground">체크 시 이 작품에는 인건비가 배분되지 않습니다</p>
                </div>
              </label>
            </div>
          </section>

          {/* 정산 대상 수익유형 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              정산 대상 수익유형
            </div>
            <div className="space-y-2">
              {ALL_REVENUE_TYPES.map(type => (
                <label
                  key={type}
                  className="flex items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2 cursor-pointer hover:bg-muted/80 transition-colors"
                >
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
                  <span className="text-sm">{REVENUE_TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t bg-muted/40 px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">취소</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
