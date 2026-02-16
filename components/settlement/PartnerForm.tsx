'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsPartner, PartnerType } from '@/lib/types/settlement';

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  individual: '개인 (3.3%)',
  domestic_corp: '국내법인 (0%)',
  foreign_corp: '해외법인 (22%)',
  naver: '네이버 (0%)',
};

const PARTNER_TYPE_TAX: Record<PartnerType, number> = {
  individual: 0.033,
  domestic_corp: 0,
  foreign_corp: 0.22,
  naver: 0,
};

interface PartnerFormProps {
  partner?: RsPartner | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<RsPartner>) => Promise<void>;
}

export function PartnerForm({ partner, open, onOpenChange, onSave }: PartnerFormProps) {
  const [name, setName] = useState(partner?.name || '');
  const [companyName, setCompanyName] = useState(partner?.company_name || '');
  const [partnerType, setPartnerType] = useState<PartnerType>(partner?.partner_type || 'individual');
  const [taxRate, setTaxRate] = useState(String(partner?.tax_rate ?? 0.033));
  const [taxId, setTaxId] = useState(partner?.tax_id || '');
  const [bankName, setBankName] = useState(partner?.bank_name || '');
  const [bankAccount, setBankAccount] = useState(partner?.bank_account || '');
  const [email, setEmail] = useState(partner?.email || '');
  const [note, setNote] = useState(partner?.note || '');
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (type: PartnerType) => {
    setPartnerType(type);
    setTaxRate(String(PARTNER_TYPE_TAX[type]));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        company_name: companyName || null,
        partner_type: partnerType,
        tax_rate: Number(taxRate),
        tax_id: taxId || null,
        bank_name: bankName || null,
        bank_account: bankAccount || null,
        email: email || null,
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
          <DialogTitle>{partner ? '파트너 수정' : '파트너 생성'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="파트너 이름" />
          </div>
          <div>
            <Label>회사명</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="회사명 (선택)" />
          </div>
          <div>
            <Label>유형</Label>
            <Select value={partnerType} onValueChange={(v) => handleTypeChange(v as PartnerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PARTNER_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>세율</Label>
            <Input type="number" step="0.001" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
          <div>
            <Label>사업자/주민번호</Label>
            <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
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
            <Label>이메일</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
