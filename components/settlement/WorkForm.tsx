'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsWork, ContractType, SettlementLevel } from '@/lib/types/settlement';

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  exclusive: '독점',
  non_exclusive: '비독점',
  management: '매니지먼트',
};

interface WorkFormProps {
  work?: RsWork | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<RsWork>) => Promise<void>;
}

export function WorkForm({ work, open, onOpenChange, onSave }: WorkFormProps) {
  const [name, setName] = useState(work?.name || '');
  const [naverName, setNaverName] = useState(work?.naver_name || '');
  const [contractType, setContractType] = useState<ContractType>(work?.contract_type || 'exclusive');
  const [settlementLevel, setSettlementLevel] = useState<SettlementLevel>(work?.settlement_level || 'work');
  const [serialStartDate, setSerialStartDate] = useState(work?.serial_start_date || '');
  const [serialEndDate, setSerialEndDate] = useState(work?.serial_end_date || '');
  const [note, setNote] = useState(work?.note || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        naver_name: naverName || null,
        contract_type: contractType,
        settlement_level: settlementLevel,
        serial_start_date: serialStartDate || null,
        serial_end_date: serialEndDate || null,
        note: note || null,
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
          <DialogTitle>{work ? '작품 수정' : '작품 생성'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>작품명 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="작품명" />
          </div>
          <div>
            <Label>네이버 작품명</Label>
            <Input value={naverName} onChange={(e) => setNaverName(e.target.value)} placeholder="네이버에서 사용하는 작품명 (매칭용)" />
          </div>
          <div>
            <Label>계약 유형</Label>
            <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONTRACT_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>정산 단위</Label>
            <Select value={settlementLevel} onValueChange={(v) => setSettlementLevel(v as SettlementLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="work">작품 단위</SelectItem>
                <SelectItem value="partner">파트너 단위</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>연재 시작일</Label>
              <Input type="date" value={serialStartDate} onChange={(e) => setSerialStartDate(e.target.value)} />
            </div>
            <div>
              <Label>연재 종료일</Label>
              <Input type="date" value={serialEndDate} onChange={(e) => setSerialEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>메모</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
