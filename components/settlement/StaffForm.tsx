'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsStaff, RsPartner, EmployerType } from '@/lib/types/settlement';

interface StaffFormProps {
  staff?: RsStaff | null;
  partners: RsPartner[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<RsStaff>) => Promise<void>;
}

export function StaffForm({ staff, partners, open, onOpenChange, onSave }: StaffFormProps) {
  const [name, setName] = useState('');
  const [employerType, setEmployerType] = useState<EmployerType>('author');
  const [employerPartnerId, setEmployerPartnerId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (staff) {
      setName(staff.name || '');
      setEmployerType(staff.employer_type || 'author');
      setEmployerPartnerId(staff.employer_partner_id || '');
      setPhone(staff.phone || '');
      setEmail(staff.email || '');
      setBankName(staff.bank_name || '');
      setBankAccount(staff.bank_account || '');
      setNote(staff.note || '');
    } else {
      setName('');
      setEmployerType('author');
      setEmployerPartnerId('');
      setPhone('');
      setEmail('');
      setBankName('');
      setBankAccount('');
      setNote('');
    }
  }, [staff, open]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        employer_type: employerType,
        employer_partner_id: employerType === 'author' ? employerPartnerId || null : null,
        phone: phone || null,
        email: email || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
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
          <DialogTitle>{staff ? '인력 수정' : '인력 추가'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="스태프 이름" />
          </div>
          <div>
            <Label>소속 구분</Label>
            <Select value={employerType} onValueChange={(v) => setEmployerType(v as EmployerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="author">작가 소속</SelectItem>
                <SelectItem value="company">회사 소속 (더그림)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {employerType === 'author' && (
            <div>
              <Label>소속 작가</Label>
              <Select value={employerPartnerId} onValueChange={setEmployerPartnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="작가 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>연락처</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" />
            </div>
            <div>
              <Label>이메일</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>은행명</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <Label>계좌번호</Label>
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} />
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
