'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RsPartner, PartnerType, ReportType } from '@/lib/types/settlement';

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  individual: '개인 (3.3%)',
  individual_employee: '개인-임직원 (3.3%)',
  individual_simple_tax: '개인-간이과세 (3.3%)',
  domestic_corp: '국내법인 (VAT 10% 별도)',
  foreign_corp: '해외법인 (22%)',
  naver: '네이버 (VAT 10% 별도)',
};

const PARTNER_TYPE_TAX: Record<PartnerType, number> = {
  individual: 0.033,
  individual_employee: 0.033,
  individual_simple_tax: 0.033,
  domestic_corp: 0,
  foreign_corp: 0.22,
  naver: 0,
};

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: '기타소득', label: '기타소득' },
  { value: '사업소득', label: '사업소득' },
  { value: '세금계산서', label: '세금계산서' },
];

const DEFAULT_REPORT_TYPE: Record<PartnerType, ReportType> = {
  individual: '기타소득',
  individual_employee: '기타소득',
  individual_simple_tax: '사업소득',
  domestic_corp: '세금계산서',
  foreign_corp: '기타소득',
  naver: '세금계산서',
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
  const [salaryDeduction, setSalaryDeduction] = useState(String(partner?.salary_deduction ?? 0));
  const [hasSalary, setHasSalary] = useState(partner?.has_salary ?? false);
  const [reportType, setReportType] = useState<ReportType>(partner?.report_type || DEFAULT_REPORT_TYPE[partnerType]);
  const [taxId, setTaxId] = useState(partner?.tax_id || '');
  const [bankName, setBankName] = useState(partner?.bank_name || '');
  const [bankAccount, setBankAccount] = useState(partner?.bank_account || '');
  const [email, setEmail] = useState(partner?.email || '');
  const [note, setNote] = useState(partner?.note || '');
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (type: PartnerType) => {
    setPartnerType(type);
    setTaxRate(String(PARTNER_TYPE_TAX[type]));
    setReportType(DEFAULT_REPORT_TYPE[type]);
    if (type !== 'individual_employee') {
      setSalaryDeduction('0');
    }
  };

  const isEmployee = partnerType === 'individual_employee';

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        company_name: companyName || null,
        partner_type: partnerType,
        tax_rate: Number(taxRate),
        salary_deduction: isEmployee ? Number(salaryDeduction) : 0,
        has_salary: hasSalary,
        report_type: reportType,
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>세율</Label>
              <Input type="number" step="0.001" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div>
              <Label>신고구분</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(rt => (
                    <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEmployee && (
            <div>
              <Label>근로소득공제 (월 급여 차감액)</Label>
              <Input
                type="number"
                value={salaryDeduction}
                onChange={(e) => setSalaryDeduction(e.target.value)}
                placeholder="급여에서 이미 수령한 금액"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasSalary"
              checked={hasSalary}
              onChange={(e) => setHasSalary(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="hasSalary" className="cursor-pointer">
              급여 수령 (인건비 공제 대상)
            </Label>
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
