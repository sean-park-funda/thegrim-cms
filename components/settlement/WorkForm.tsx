'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsWork, ContractType, SettlementLevel } from '@/lib/types/settlement';
import { BookOpen, FileSignature, CalendarRange, StickyNote } from 'lucide-react';

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
  const [name, setName] = useState('');
  const [naverName, setNaverName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [contractType, setContractType] = useState<ContractType>('exclusive');
  const [settlementLevel, setSettlementLevel] = useState<SettlementLevel>('work');
  const [serialStartDate, setSerialStartDate] = useState('');
  const [serialEndDate, setSerialEndDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(work?.name || '');
      setNaverName(work?.naver_name || '');
      setProjectCode(work?.project_code || '');
      setContractType(work?.contract_type || 'exclusive');
      setSettlementLevel(work?.settlement_level || 'work');
      setSerialStartDate(work?.serial_start_date || '');
      setSerialEndDate(work?.serial_end_date || '');
      setNote(work?.note || '');
    }
  }, [open, work]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        naver_name: naverName || null,
        project_code: projectCode || null,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full p-0 flex flex-col gap-0">
        <SheetHeader className="px-6 py-5 border-b bg-muted/40">
          <SheetTitle className="text-lg">{work ? '작품 수정' : '새 작품'}</SheetTitle>
          <SheetDescription>
            {work ? `${work.name}의 정보를 수정합니다.` : '새로운 작품을 등록합니다.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 작품 정보 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BookOpen className="h-4 w-4 text-primary" />
              작품 정보
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="wf-name" className="text-xs text-muted-foreground">작품명 *</Label>
                <Input id="wf-name" value={name} onChange={e => setName(e.target.value)} placeholder="작품명" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="wf-naver" className="text-xs text-muted-foreground">네이버 작품명</Label>
                <Input id="wf-naver" value={naverName} onChange={e => setNaverName(e.target.value)} placeholder="네이버에서 사용하는 작품명 (매칭용)" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="wf-project-code" className="text-xs text-muted-foreground">프로젝트코드</Label>
                <Input id="wf-project-code" value={projectCode} onChange={e => setProjectCode(e.target.value)} placeholder="PN001" className="mt-1" />
              </div>
            </div>
          </section>

          {/* 계약 설정 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileSignature className="h-4 w-4 text-primary" />
              계약 설정
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">계약 유형</Label>
                <Select value={contractType} onValueChange={v => setContractType(v as ContractType)}>
                  <SelectTrigger className="mt-1">
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
                <Label className="text-xs text-muted-foreground">정산 단위</Label>
                <Select value={settlementLevel} onValueChange={v => setSettlementLevel(v as SettlementLevel)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">작품 단위</SelectItem>
                    <SelectItem value="partner">파트너 단위</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* 연재 기간 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarRange className="h-4 w-4 text-primary" />
              연재 기간
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="wf-start" className="text-xs text-muted-foreground">시작일</Label>
                <Input id="wf-start" type="date" value={serialStartDate} onChange={e => setSerialStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="wf-end" className="text-xs text-muted-foreground">종료일</Label>
                <Input id="wf-end" type="date" value={serialEndDate} onChange={e => setSerialEndDate(e.target.value)} className="mt-1" />
              </div>
            </div>
          </section>

          {/* 메모 */}
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <StickyNote className="h-4 w-4 text-primary" />
              메모
            </div>
            <Input id="wf-note" value={note} onChange={e => setNote(e.target.value)} placeholder="특이사항을 입력하세요" />
          </section>
        </div>

        <div className="border-t bg-muted/40 px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">취소</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
