'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsWork, RsStaffAssignment } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

interface Props {
  staffId: string;
  assignment?: RsStaffAssignment | null;
  existingWorkIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function StaffAssignmentDialog({ staffId, assignment, existingWorkIds, open, onOpenChange, onSaved }: Props) {
  const [works, setWorks] = useState<RsWork[]>([]);
  const [workId, setWorkId] = useState('');
  const [monthlyCost, setMonthlyCost] = useState('');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      settlementFetch('/api/accounting/settlement/works')
        .then(r => r.json())
        .then(d => setWorks(d.works || []));

      if (assignment) {
        setWorkId(assignment.work_id);
        setMonthlyCost(String(assignment.monthly_cost || ''));
        setStartMonth(assignment.start_month || '');
        setEndMonth(assignment.end_month || '');
        setNote(assignment.note || '');
      } else {
        setWorkId('');
        setMonthlyCost('');
        setStartMonth('');
        setEndMonth('');
        setNote('');
      }
    }
  }, [open, assignment]);

  const availableWorks = works.filter(w =>
    w.is_active && (assignment ? true : !existingWorkIds.includes(w.id))
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      if (assignment) {
        const res = await settlementFetch('/api/accounting/settlement/staff-assignments', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: assignment.id,
            monthly_cost: Number(monthlyCost) || 0,
            start_month: startMonth || null,
            end_month: endMonth || null,
            note: note || null,
          }),
        });
        if (res.ok) { onOpenChange(false); onSaved(); }
      } else {
        if (!workId) return;
        const res = await settlementFetch('/api/accounting/settlement/staff-assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_id: staffId,
            work_id: workId,
            monthly_cost: Number(monthlyCost) || 0,
            start_month: startMonth || null,
            end_month: endMonth || null,
            note: note || null,
          }),
        });
        if (res.ok) { onOpenChange(false); onSaved(); }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{assignment ? '배정 수정' : '작품 배정 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!assignment && (
            <div>
              <Label>작품 *</Label>
              <Select value={workId} onValueChange={setWorkId}>
                <SelectTrigger>
                  <SelectValue placeholder="작품 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {availableWorks.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>월 비용</Label>
            <Input
              type="number"
              value={monthlyCost}
              onChange={(e) => setMonthlyCost(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>시작월</Label>
              <Input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div>
              <Label>종료월</Label>
              <Input
                type="month"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                placeholder="진행중"
              />
            </div>
          </div>
          <div>
            <Label>메모</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saving || (!assignment && !workId)}>
              {saving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
