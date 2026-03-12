'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RsPartner, PartnerType, ReportType } from '@/lib/types/settlement';
import { User, Receipt, Settings, CreditCard, StickyNote } from 'lucide-react';

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
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [partnerType, setPartnerType] = useState<PartnerType>('individual');
  const [taxRate, setTaxRate] = useState('0.033');
  const [salaryDeduction, setSalaryDeduction] = useState('0');
  const [hasSalary, setHasSalary] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('기타소득');
  const [taxId, setTaxId] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [email, setEmail] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(partner?.name || '');
      setCompanyName(partner?.company_name || '');
      setPartnerType(partner?.partner_type || 'individual');
      setTaxRate(String(partner?.tax_rate ?? 0.033));
      setSalaryDeduction(String(partner?.salary_deduction ?? 0));
      setHasSalary(partner?.has_salary ?? false);
      setReportType(partner?.report_type || DEFAULT_REPORT_TYPE[partner?.partner_type || 'individual']);
      setTaxId(partner?.tax_id || '');
      setBankName(partner?.bank_name || '');
      setBankAccount(partner?.bank_account || '');
      setEmail(partner?.email || '');
      setIsForeign(partner?.is_foreign ?? false);
      setNote(partner?.note || '');
    }
  }, [open, partner]);

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
        is_foreign: isForeign,
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
          <SheetTitle className="text-lg">{partner ? '파트너 수정' : '새 파트너'}</SheetTitle>
          <SheetDescription>
            {partner ? `${partner.name}의 정보를 수정합니다.` : '새로운 파트너를 등록합니다.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* 기본 정보 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              기본 정보
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="name" className="text-xs text-muted-foreground">이름 *</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="파트너 이름" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="company" className="text-xs text-muted-foreground">회사명 / 거래처명</Label>
                <Input id="company" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="선택 사항" className="mt-1" />
              </div>
            </div>
          </section>

          {/* 소득 · 세금 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="h-4 w-4 text-primary" />
              소득 · 세금
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">유형</Label>
                <Select value={partnerType} onValueChange={v => handleTypeChange(v as PartnerType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PARTNER_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="taxRate" className="text-xs text-muted-foreground">세율</Label>
                  <Input id="taxRate" type="number" step="0.001" value={taxRate} onChange={e => setTaxRate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">신고구분</Label>
                  <Select value={reportType} onValueChange={v => setReportType(v as ReportType)}>
                    <SelectTrigger className="mt-1">
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
              <div>
                <Label htmlFor="taxId" className="text-xs text-muted-foreground">사업자/주민번호</Label>
                <Input id="taxId" value={taxId} onChange={e => setTaxId(e.target.value)} placeholder="000-00-00000" className="mt-1" />
              </div>
            </div>
          </section>

          {/* 옵션 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4 text-primary" />
              옵션
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
                <div>
                  <Label htmlFor="hasSalary" className="text-sm cursor-pointer">급여 수령</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">인건비 공제 대상 여부</p>
                </div>
                <Switch id="hasSalary" checked={hasSalary} onCheckedChange={setHasSalary} />
              </div>
              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2.5">
                <div>
                  <Label htmlFor="isForeign" className="text-sm cursor-pointer">외국인</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">예고료 대상에서 제외</p>
                </div>
                <Switch id="isForeign" checked={isForeign} onCheckedChange={setIsForeign} />
              </div>
              {isEmployee && (
                <div>
                  <Label htmlFor="salaryDeduction" className="text-xs text-muted-foreground">근로소득공제 (월 급여 차감액)</Label>
                  <Input id="salaryDeduction" type="number" value={salaryDeduction} onChange={e => setSalaryDeduction(e.target.value)} placeholder="0" className="mt-1" />
                </div>
              )}
            </div>
          </section>

          {/* 결제 · 연락처 */}
          <section className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4 text-primary" />
              결제 · 연락처
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bankName" className="text-xs text-muted-foreground">은행명</Label>
                  <Input id="bankName" value={bankName} onChange={e => setBankName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="bankAccount" className="text-xs text-muted-foreground">계좌번호</Label>
                  <Input id="bankAccount" value={bankAccount} onChange={e => setBankAccount(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label htmlFor="email" className="text-xs text-muted-foreground">이메일</Label>
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" />
              </div>
            </div>
          </section>

          {/* 메모 */}
          <section className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <StickyNote className="h-4 w-4 text-primary" />
              메모
            </div>
            <Input id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="특이사항을 입력하세요" />
          </section>
        </div>

        <div className="border-t bg-muted/40 px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            취소
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="flex-1">
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
