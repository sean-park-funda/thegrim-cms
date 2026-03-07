'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsStaffAssignment, RsWorkPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

interface Props {
  staffId: string;
  employerPartnerId?: string;
  assignment?: RsStaffAssignment | null;
  existingWorkIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function StaffAssignmentDialog({ staffId, employerPartnerId, assignment, existingWorkIds, open, onOpenChange, onSaved }: Props) {
  const [partnerWorks, setPartnerWorks] = useState<RsWorkPartner[]>([]);
  const [workId, setWorkId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (employerPartnerId) {
        settlementFetch(`/api/accounting/settlement/work-partners?partnerId=${employerPartnerId}`)
          .then(r => r.json())
          .then(d => setPartnerWorks(d.work_partners || []));
      }

      if (assignment) {
        setWorkId(assignment.work_id);
        setNote(assignment.note || '');
      } else {
        setWorkId('');
        setNote('');
      }
    }
  }, [open, assignment, employerPartnerId]);

  const availableWorks = partnerWorks.filter(wp =>
    assignment ? true : !existingWorkIds.includes(wp.work_id)
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
                  {availableWorks.map((wp) => (
                    <SelectItem key={wp.work_id} value={wp.work_id}>
                      {wp.work?.name || wp.work_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
