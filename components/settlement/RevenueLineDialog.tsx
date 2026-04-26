'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { settlementFetch } from '@/lib/settlement/api';
import { RsRevenueLine } from '@/lib/types/settlement';
import { Check, Loader2 } from 'lucide-react';

interface RevenueLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workId: string;
  workName: string;
  month: string;
  revenueType: string;
  canManage: boolean;
  onUpdated?: () => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

type EditField = 'adjustment_supply' | 'adjustment_vat';

export function RevenueLineDialog({
  open,
  onOpenChange,
  workId,
  workName,
  month,
  revenueType,
  canManage,
  onUpdated,
}: RevenueLineDialogProps) {
  const [lines, setLines] = useState<RsRevenueLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const REVENUE_TYPE_LABELS: Record<string, string> = {
    domestic_paid: '국내유료',
    global_paid: '글로벌유료',
    domestic_ad: '국내광고',
    global_ad: '글로벌광고',
    secondary: '2차사업',
  };

  useEffect(() => {
    if (!open) return;
    loadLines();
  }, [open, workId, month, revenueType]);

  const loadLines = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch(
        `/api/accounting/settlement/revenue-lines?work_id=${workId}&month=${month}&revenue_type=${revenueType}`
      );
      const data = await res.json();
      setLines(data.lines || []);
    } catch (e) {
      console.error('상세 행 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (lineId: string) => {
    if (!editingField) return;
    setSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/revenue-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineId, [editingField]: Number(editValue) || 0 }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditingField(null);
        await loadLines();
        onUpdated?.();
      }
    } catch (e) {
      console.error('조정 저장 오류:', e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (lineId: string, field: EditField, currentValue: number) => {
    if (!canManage) return;
    setEditingId(lineId);
    setEditingField(field);
    setEditValue(String(currentValue));
  };

  // 플랫폼별 그룹핑
  const grouped = useMemo(() => {
    const map = new Map<string, RsRevenueLine[]>();
    for (const line of lines) {
      const key = line.service_platform || '기타';
      const list = map.get(key) || [];
      list.push(line);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const sumA = a[1].reduce((s, l) => s + Number(l.supply_amount) + Number(l.adjustment_supply), 0);
      const sumB = b[1].reduce((s, l) => s + Number(l.supply_amount) + Number(l.adjustment_supply), 0);
      return sumB - sumA;
    });
  }, [lines]);

  const totals = useMemo(() => {
    let payment = 0, supply = 0, vat = 0, adjSupply = 0, adjVat = 0;
    for (const l of lines) {
      payment += Number(l.payment_krw);
      supply += Number(l.supply_amount);
      vat += Number(l.vat_amount);
      adjSupply += Number(l.adjustment_supply);
      adjVat += Number(l.adjustment_vat);
    }
    return { payment, supply, vat, adjSupply, adjVat, finalSupply: supply + adjSupply, finalVat: vat + adjVat };
  }, [lines]);

  const renderAdjCell = (line: RsRevenueLine, field: EditField, value: number) => {
    const isEditing = editingId === line.id && editingField === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1 justify-end">
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-20 h-6 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave(line.id);
              if (e.key === 'Escape') { setEditingId(null); setEditingField(null); }
            }}
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleSave(line.id)}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
        </div>
      );
    }

    return (
      <span
        className={`tabular-nums ${
          canManage ? 'cursor-pointer hover:text-primary hover:underline' : ''
        } ${value !== 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}
        onClick={() => startEdit(line.id, field, value)}
      >
        {value !== 0 ? fmt(value) : '-'}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {workName}
            <Badge variant="secondary">{REVENUE_TYPE_LABELS[revenueType] || revenueType}</Badge>
            <span className="text-sm font-normal text-muted-foreground">{month}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">로딩 중...</div>
        ) : lines.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            상세 행 데이터가 없습니다.
            <br />
            <span className="text-xs">(이 수익유형의 엑셀을 재업로드하면 상세 행이 자동 생성됩니다)</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 요약 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Payment(VAT포함)', value: totals.payment },
                { label: '공급가액', value: totals.supply },
                { label: '부가세', value: totals.vat },
                { label: '확정 공급가', value: totals.finalSupply, highlight: totals.adjSupply !== 0 },
                { label: '확정 부가세', value: totals.finalVat, highlight: totals.adjVat !== 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className={`text-lg font-semibold tabular-nums ${item.highlight ? 'text-amber-600' : ''}`}>
                    {fmt(item.value)}
                  </div>
                </div>
              ))}
            </div>

            {/* 플랫폼별 테이블 */}
            {grouped.map(([platform, platformLines]) => {
              const pFinalSupply = platformLines.reduce((s, l) => s + Number(l.supply_amount) + Number(l.adjustment_supply), 0);
              const pFinalVat = platformLines.reduce((s, l) => s + Number(l.vat_amount) + Number(l.adjustment_vat), 0);
              return (
                <div key={platform} className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{platform}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      공급가 {fmt(pFinalSupply)} / VAT {fmt(pFinalVat)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left bg-muted/20">
                          <th className="py-1.5 px-2 font-medium">국가</th>
                          <th className="py-1.5 px-2 font-medium">통화</th>
                          <th className="py-1.5 px-2 font-medium text-right">Payment</th>
                          <th className="py-1.5 px-2 font-medium text-right">공급가액</th>
                          <th className="py-1.5 px-2 font-medium text-right">부가세</th>
                          <th className="py-1.5 px-2 font-medium text-right text-amber-600">조정(공급가)</th>
                          <th className="py-1.5 px-2 font-medium text-right text-amber-600">조정(VAT)</th>
                          <th className="py-1.5 px-2 font-medium text-right">확정 공급가</th>
                          <th className="py-1.5 px-2 font-medium text-right">확정 VAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {platformLines.map((line) => {
                          const adjS = Number(line.adjustment_supply);
                          const adjV = Number(line.adjustment_vat);
                          const finalS = Number(line.supply_amount) + adjS;
                          const finalV = Number(line.vat_amount) + adjV;
                          return (
                            <tr key={line.id} className="border-b hover:bg-muted/30">
                              <td className="py-1.5 px-2">{line.country || '-'}</td>
                              <td className="py-1.5 px-2">{line.sale_currency || '-'}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(line.payment_krw))}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(line.supply_amount))}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums">{fmt(Number(line.vat_amount))}</td>
                              <td className="py-1.5 px-2 text-right">{renderAdjCell(line, 'adjustment_supply', adjS)}</td>
                              <td className="py-1.5 px-2 text-right">{renderAdjCell(line, 'adjustment_vat', adjV)}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums font-medium">{fmt(finalS)}</td>
                              <td className="py-1.5 px-2 text-right tabular-nums font-medium">{fmt(finalV)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
