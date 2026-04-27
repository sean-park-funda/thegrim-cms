'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { PartnerForm } from '@/components/settlement/PartnerForm';
import { ContractEditDialog } from '@/components/settlement/ContractEditDialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, FileText, Plus, Users, Trash2, Pause, Play, BookOpenText } from 'lucide-react';
import { RsPartner, RsWorkPartner, RsSettlement, RsWork } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

interface TaxBreakdown {
  income_tax: number;
  local_tax: number;
  vat: number;
  total: number;
}

interface WorkDetail {
  revenue_type: string;
  revenue_type_label: string;
  gross_revenue: number;
  base_revenue: number;
  exclusion_amount: number;
  settlement_target: number;
  revenue_share: number;
  self_labor_cost: number;
  team_labor_cost: number;
  labor_cost: number;
  net_share: number;
  rs_rate: number;
  excluded?: boolean;
}

interface WorkStatement {
  work_name: string;
  work_id: string;
  rs_rate: number;
  revenue_rate: number;
  is_mg_applied: boolean;
  mg_hold: boolean;
  mg_dependency_blocked: boolean;
  mg_depends_on: { partner_id: string; work_id: string } | null;
  mg_dep_info: { partner_name: string; balance: number } | null;
  revenue_adjustments: { id: string; label: string; amount: number }[];
  revenue_adjustment_total: number;
  revenue_adjustment_rs: number;
  effective_rate: number;
  details: WorkDetail[];
  work_total_revenue: number;
  work_total_base_revenue: number;
  work_total_exclusion: number;
  work_total_settlement_target: number;
  work_total_share: number;
  work_total_labor_cost: number;
  work_total_self_labor_cost: number;
  work_total_team_labor_cost: number;
  work_total_net_share: number;
  mg_balance: number;
  mg_deduction: number;
  mg_deduction_adjustments: { id: string; label: string; amount: number }[];
  mg_deduction_adjustment_total: number;
  mg_remaining: number;
  mg_from_labor_cost: number;
}

interface MgHistoryEntry {
  month: string;
  previous_balance: number;
  mg_added: number;
  mg_deducted: number;
  current_balance: number;
  note: string;
}

interface MgWorkHistory {
  work_name: string;
  history: MgHistoryEntry[];
}

interface StatementData {
  partner: { id: string; name: string; company_name: string | null; partner_type: string; };
  month: string;
  works: WorkStatement[];
  grand_total_revenue: number;
  grand_total_base_revenue: number;
  grand_total_exclusion: number;
  grand_total_settlement_target: number;
  grand_total_share: number;
  grand_total_labor_cost: number;
  grand_total_self_labor_cost: number;
  grand_total_team_labor_cost: number;
  grand_total_net_share: number;
  tax_type: string;
  tax_breakdown: TaxBreakdown;
  tax_amount: number;
  insurance: number;
  total_mg_deduction: number;
  total_mg_from_labor_cost: number;
  adjustments: { id: string; label: string; amount: number }[];
  total_adjustment: number;
  final_payment: number;
  mg_history?: MgWorkHistory[];
  tax_invoice?: { item: string; supply: number; vat: number; total: number }[] | null;
  tax_invoice_total?: number;
  mg_dep_references?: { work_name: string; partner_name: string; history: { month: string; previous_balance: number; mg_added: number; mg_deducted: number; current_balance: number }[] }[];
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인 (3.3%)',
  individual_employee: '개인-임직원 (3.3%)',
  individual_simple_tax: '개인-간이과세 (3.3%)',
  domestic_corp: '국내법인 (VAT 10% 별도)',
  foreign_corp: '해외법인 (22%)',
  naver: '네이버 (VAT 10% 별도)',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : n < 0 ? n.toLocaleString() : '-');

export default function PartnerDetailPage() {
  const params = useParams();
  const partnerId = params.id as string;
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();

  const [partner, setPartner] = useState<RsPartner | null>(null);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [settlements, setSettlements] = useState<RsSettlement[]>([]);
  const [mgBalances, setMgBalances] = useState<any[]>([]);
  const [works, setWorks] = useState<RsWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const [laborCostPersons, setLaborCostPersons] = useState<{ person_name: string; person_type: string; deduction_type: string; amount: number; month: string }[]>([]);

  const [partnerSalary, setPartnerSalary] = useState<number>(0);
  const [partnerSalaryInput, setPartnerSalaryInput] = useState('');
  const [partnerSalarySaving, setPartnerSalarySaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [contractWp, setContractWp] = useState<RsWorkPartner | null>(null);

  // 조정 항목 추가
  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  const handleAddAdjustment = async () => {
    if (!adjLabel || !adjAmount || !statement) return;
    setAdjSaving(true);
    try {
      await settlementFetch('/api/accounting/settlement/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          month: statement.month,
          label: adjLabel,
          amount: Number(adjAmount),
        }),
      });
      setAdjDialogOpen(false);
      setAdjLabel('');
      setAdjAmount('');
      // reload statement
      const res = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${statement.month}`);
      if (res.ok) setStatement(await res.json());
    } finally {
      setAdjSaving(false);
    }
  };

  const handleDeleteAdjustment = async (adjId: string) => {
    if (!confirm('이 조정 항목을 삭제하시겠습니까?')) return;
    if (!statement) return;
    await settlementFetch('/api/accounting/settlement/adjustments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: adjId }),
    });
    const res = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${statement.month}`);
    if (res.ok) setStatement(await res.json());
  };
  const [contractDialogOpen, setContractDialogOpen] = useState(false);


  // MG차감 조정
  const [mgDedAdjDialogOpen, setMgDedAdjDialogOpen] = useState(false);
  const [mgDedAdjWorkId, setMgDedAdjWorkId] = useState('');
  const [mgDedAdjWorkName, setMgDedAdjWorkName] = useState('');
  const [mgDedAdjLabel, setMgDedAdjLabel] = useState('');
  const [mgDedAdjAmount, setMgDedAdjAmount] = useState('');
  const [mgDedAdjSaving, setMgDedAdjSaving] = useState(false);

  const handleAddMgDedAdj = async () => {
    if (!mgDedAdjLabel || !mgDedAdjAmount || !statement) return;
    setMgDedAdjSaving(true);
    try {
      await settlementFetch('/api/accounting/settlement/mg-deduction-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          work_id: mgDedAdjWorkId,
          month: selectedMonth,
          label: mgDedAdjLabel,
          amount: Number(mgDedAdjAmount),
        }),
      });
      setMgDedAdjDialogOpen(false);
      setMgDedAdjLabel('');
      setMgDedAdjAmount('');
      // reload statement + mg balances
      const [stRes, mgRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${selectedMonth}`),
        settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}&month=${selectedMonth}`),
      ]);
      if (stRes.ok) setStatement(await stRes.json());
      if (mgRes.ok) {
        const mgData = await mgRes.json();
        setMgBalances((mgData.mg_balances || []).sort((a: any, b: any) => (b.contracted_at || '').localeCompare(a.contracted_at || '')));
      }
    } finally {
      setMgDedAdjSaving(false);
    }
  };

  const handleDeleteMgDedAdj = async (adjId: string) => {
    if (!confirm('이 MG차감 조정을 삭제하시겠습니까?')) return;
    await settlementFetch('/api/accounting/settlement/mg-deduction-adjustments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: adjId }),
    });
    const [stRes, mgRes] = await Promise.all([
      settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${selectedMonth}`),
      settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}&month=${selectedMonth}`),
    ]);
    if (stRes.ok) setStatement(await stRes.json());
    if (mgRes.ok) {
      const mgData = await mgRes.json();
      setMgBalances((mgData.mg_balances || []).sort((a: any, b: any) => (b.contracted_at || '').localeCompare(a.contracted_at || '')));
    }
  };

  const [mgHoldLogs, setMgHoldLogs] = useState<{ id: string; work_id: string; action: string; reason: string; created_at: string }[]>([]);
  const [mgHoldReason, setMgHoldReason] = useState('');
  const [mgHoldDialogOpen, setMgHoldDialogOpen] = useState(false);
  const [mgHoldTarget, setMgHoldTarget] = useState<{ workId: string; workName: string; currentHold: boolean } | null>(null);

  const handleMgHoldToggle = async () => {
    if (!mgHoldTarget) return;
    const action = mgHoldTarget.currentHold ? 'release' : 'hold';
    await settlementFetch('/api/accounting/settlement/mg-hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: partnerId,
        work_id: mgHoldTarget.workId,
        action,
        reason: mgHoldReason || undefined,
      }),
    });
    setMgHoldDialogOpen(false);
    setMgHoldReason('');
    setMgHoldTarget(null);
    // reload
    const [stRes, mgRes, holdRes] = await Promise.all([
      settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${selectedMonth}`),
      settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}&month=${selectedMonth}`),
      settlementFetch(`/api/accounting/settlement/mg-hold?partner_id=${partnerId}`),
    ]);
    if (stRes.ok) setStatement(await stRes.json());
    if (mgRes.ok) {
      const mgData = await mgRes.json();
      setMgBalances((mgData.mg_balances || []).sort((a: any, b: any) => (b.contracted_at || '').localeCompare(a.contracted_at || '')));
    }
    if (holdRes.ok) {
      const holdData = await holdRes.json();
      setMgHoldLogs(holdData.logs || []);
    }
  };

  // 예고료 면제
  const [insuranceExemption, setInsuranceExemption] = useState<{ id: string; reason: string | null } | null>(null);
  const [insExemptDialogOpen, setInsExemptDialogOpen] = useState(false);
  const [insExemptReason, setInsExemptReason] = useState('');
  const [insExemptSaving, setInsExemptSaving] = useState(false);

  const loadInsuranceExemption = async (month: string) => {
    const res = await settlementFetch(`/api/accounting/settlement/insurance-exemptions?partner_id=${partnerId}&month=${month}`);
    if (res.ok) {
      const data = await res.json();
      const exemptions = data.exemptions || [];
      setInsuranceExemption(exemptions.length > 0 ? { id: exemptions[0].id, reason: exemptions[0].reason } : null);
    }
  };

  const handleAddInsuranceExemption = async () => {
    if (!statement) return;
    setInsExemptSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/insurance-exemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: partnerId, month: statement.month, reason: insExemptReason || null }),
      });
      if (res.ok) {
        setInsExemptDialogOpen(false);
        setInsExemptReason('');
        await loadInsuranceExemption(statement.month);
        // reload statement
        const stRes = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${statement.month}`);
        if (stRes.ok) setStatement(await stRes.json());
      }
    } finally {
      setInsExemptSaving(false);
    }
  };

  const handleRemoveInsuranceExemption = async () => {
    if (!insuranceExemption || !statement) return;
    if (!confirm('예고료 면제를 해제하시겠습니까?')) return;
    await settlementFetch('/api/accounting/settlement/insurance-exemptions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: insuranceExemption.id }),
    });
    setInsuranceExemption(null);
    const stRes = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}/statement?month=${statement.month}`);
    if (stRes.ok) setStatement(await stRes.json());
  };

  const [mgDialogOpen, setMgDialogOpen] = useState(false);
  const [mgWorkId, setMgWorkId] = useState('');
  const [mgAmount, setMgAmount] = useState('');
  const [mgNote, setMgNote] = useState('');
  const [mgSaving, setMgSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [partnerRes, wpRes, settRes, mgRes, worksRes, laborCostRes, holdRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/partners/${partnerId}`),
        settlementFetch(`/api/accounting/settlement/work-partners?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/settlements?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}&month=${selectedMonth}`),
        settlementFetch('/api/accounting/settlement/works'),
        settlementFetch(`/api/accounting/settlement/labor-cost-items?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/mg-hold?partner_id=${partnerId}`),
      ]);
      const partnerData = await partnerRes.json();
      const wpData = await wpRes.json();
      const settData = await settRes.json();
      const mgData = await mgRes.json();
      const worksData = await worksRes.json();
      const laborCostData = await laborCostRes.json();
      if (holdRes.ok) {
        const holdData = await holdRes.json();
        setMgHoldLogs(holdData.logs || []);
      }

      setPartner(partnerData.partner || null);
      setWorkPartners(wpData.work_partners || []);
      setSettlements(
        (settData.settlements || []).sort((a: RsSettlement, b: RsSettlement) => b.month.localeCompare(a.month))
      );
      setMgBalances(
        (mgData.mg_balances || []).sort((a: any, b: any) => (b.contracted_at || '').localeCompare(a.contracted_at || ''))
      );
      setWorks(worksData.works || []);

      // 인건비공제에서 공제인원 목록 추출 (중복 제거: person_name 기준 최신)
      const items = laborCostData.items || [];
      const personMap = new Map<string, typeof items[0]>();
      for (const item of items) {
        const key = `${item.person_type}:${item.person_id}`;
        const existing = personMap.get(key);
        if (!existing || item.month > existing.month) {
          personMap.set(key, item);
        }
      }
      setLaborCostPersons(Array.from(personMap.values()).map((item: { person_name: string; person_type: string; deduction_type: string; amount: number; month: string }) => ({
        person_name: item.person_name,
        person_type: item.person_type,
        deduction_type: item.deduction_type,
        amount: item.amount,
        month: item.month,
      })));
    } catch (e) {
      console.error('파트너 상세 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role) && partnerId) {
      load();
    }
  }, [profile, partnerId]);

  const loadPartnerSalary = async () => {
    try {
      const res = await settlementFetch(
        `/api/accounting/settlement/partner-salaries?partnerId=${partnerId}&month=${selectedMonth}`
      );
      const json = await res.json();
      const salary = json.salaries?.[0]?.amount ?? 0;
      setPartnerSalary(Number(salary));
      setPartnerSalaryInput(Number(salary) > 0 ? String(Number(salary)) : '');
    } catch {
      setPartnerSalary(0);
      setPartnerSalaryInput('');
    }
  };

  const handlePartnerSalarySave = async () => {
    setPartnerSalarySaving(true);
    try {
      await settlementFetch('/api/accounting/settlement/partner-salaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partner_id: partnerId,
          month: selectedMonth,
          amount: Number(partnerSalaryInput) || 0,
        }),
      });
      await loadPartnerSalary();
    } finally {
      setPartnerSalarySaving(false);
    }
  };

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role) || !partnerId) return;
    async function loadStatement() {
      setStatementLoading(true);
      try {
        const res = await settlementFetch(
          `/api/accounting/settlement/partners/${partnerId}/statement?month=${selectedMonth}`
        );
        const json = await res.json();
        setStatement(json);
      } catch (e) {
        console.error('정산서 로드 오류:', e);
      } finally {
        setStatementLoading(false);
      }
    }
    loadStatement();
    loadPartnerSalary();
    loadInsuranceExemption(selectedMonth);
  }, [profile, partnerId, selectedMonth]);

  const handleUpdate = async (data: Partial<RsPartner>) => {
    const res = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };


  const handleMgAdd = async () => {
    if (!mgWorkId || !mgAmount) return;
    setMgSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/mg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          work_id: mgWorkId,
          partner_id: partnerId,
          mg_added: Number(mgAmount),
          note: mgNote || undefined,
        }),
      });
      if (res.ok) {
        setMgDialogOpen(false);
        setMgWorkId('');
        setMgAmount('');
        setMgNote('');
        await load();
      }
    } finally {
      setMgSaving(false);
    }
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  const monthlySettlements = new Map<string, { revenue_share: number; final_payment: number; works: string[] }>();
  for (const s of settlements) {
    const existing = monthlySettlements.get(s.month);
    if (existing) {
      existing.revenue_share += s.revenue_share;
      existing.final_payment += s.final_payment;
      if (s.work?.name) existing.works.push(s.work.name);
    } else {
      monthlySettlements.set(s.month, {
        revenue_share: s.revenue_share,
        final_payment: s.final_payment,
        works: s.work?.name ? [s.work.name] : [],
      });
    }
  }
  const monthlyData = Array.from(monthlySettlements.entries())
    .sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounting/settlement/partners">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            파트너 목록
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      ) : !partner ? (
        <div className="text-sm text-muted-foreground py-8 text-center">파트너를 찾을 수 없습니다.</div>
      ) : (
        <>
          {/* 파트너 기본 정보 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>{partner.name}</CardTitle>
                {partner.company_name && (
                  <span className="text-sm text-muted-foreground">({partner.company_name})</span>
                )}
                <Badge variant="secondary">{PARTNER_TYPE_LABELS[partner.partner_type] || partner.partner_type}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    수정
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* 소득 · 세금 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">세율</span>
                  <p className="font-medium">{(partner.tax_rate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">신고구분</span>
                  <p className="font-medium">{partner.report_type || '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">사업자/주민번호</span>
                  <p className="font-medium">{partner.tax_id || '-'}</p>
                </div>
                {partner.partner_type === 'individual_employee' && (
                  <div>
                    <span className="text-muted-foreground text-xs">근로소득공제</span>
                    <p className="font-medium">{partner.salary_deduction > 0 ? `${partner.salary_deduction.toLocaleString()}원` : '-'}</p>
                  </div>
                )}
              </div>

              {/* 옵션 */}
              <div className="flex flex-wrap gap-2">
                {partner.has_salary && (
                  <Badge variant="default" className="text-xs">급여 수령</Badge>
                )}
                {partner.is_foreign && (
                  <Badge variant="secondary" className="text-xs">외국인</Badge>
                )}
              </div>

              {/* 결제 · 연락처 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">은행</span>
                  <p className="font-medium">{partner.bank_name ? `${partner.bank_name} ${partner.bank_account || ''}` : '-'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">이메일</span>
                  <p className="font-medium">{partner.email || '-'}</p>
                </div>
              </div>

              {/* 메모 */}
              {partner.note && (
                <div className="text-sm">
                  <span className="text-muted-foreground text-xs">메모</span>
                  <p className="text-muted-foreground">{partner.note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 계약 작품 목록 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">계약 작품 ({workPartners.length}건)</CardTitle>
            </CardHeader>
            <CardContent>
              {workPartners.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">연결된 작품이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">작품명</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">매출액적용율</th>
                        <th className="py-2 px-3 font-medium text-right">RS 요율</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약구분</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약기간</th>
                        {canManage && <th className="py-2 px-3 font-medium w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {workPartners.map((wp) => (
                        <tr
                          key={wp.id}
                          className="border-b hover:bg-muted/50"
                        >
                          <td className="py-2 px-3">
                            <Link
                              href={`/accounting/settlement/works/${wp.work_id}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {wp.work?.name || wp.work_id}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                            {`${((wp.revenue_rate ?? 1) * 100).toFixed(0)}%`}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {(wp.rs_rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_category || '-'}</td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_period || '-'}</td>
                          {canManage && (
                            <td className="py-2 px-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setContractWp(wp); setContractDialogOpen(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 정산서 (선택 월 기준) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">정산서 — {selectedMonth}</CardTitle>
            </CardHeader>
            <CardContent>
              {statementLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">로딩 중...</div>
              ) : !statement || statement.works.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  해당 월의 정산 데이터가 없습니다.
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 1. 정산상세내역 */}
                  {(() => {
                    const hasBaseRevenue = statement.works.some(w => w.revenue_rate !== 1);
                    const hasExclusion = statement.grand_total_exclusion > 0;
                    const hasEarnedIncome = statement.grand_total_self_labor_cost > 0;
                    const hasLaborCostDed = statement.grand_total_team_labor_cost > 0;
                    const hasAnyDeduction = hasEarnedIncome || hasLaborCostDed;
                    // 작품명, 수익유형, 총매출, [기준매출], [정산제외], [정산대상], [수익배분], [인건비공제], [근로소득공제], 정산금, RS율
                    const colCount = 4 + (hasBaseRevenue ? 1 : 0) + (hasExclusion ? 1 : 0) + ((hasBaseRevenue || hasExclusion) ? 1 : 0) + (hasAnyDeduction ? 1 : 0) + (hasLaborCostDed ? 1 : 0) + (hasEarnedIncome ? 1 : 0);
                    // 더그림수익(col2)과 수익정산(colCount-2) 사이의 중간 컬럼 수
                    const midCols = colCount - 4; // colCount - 작품구분 - 수익구분 - 수익정산 - RS율
                    return (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">1. 정산상세내역</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="py-2 px-3 font-medium">작품 구분</th>
                            <th className="py-2 px-3 font-medium">수익구분</th>
                            <th className="py-2 px-3 font-medium text-right">더그림수익</th>
                            {hasBaseRevenue && (
                              <th className="py-2 px-3 font-medium text-right">기준매출</th>
                            )}
                            {hasExclusion && (
                              <th className="py-2 px-3 font-medium text-right">정산제외금</th>
                            )}
                            {(hasBaseRevenue || hasExclusion) && (
                              <th className="py-2 px-3 font-medium text-right">정산대상금</th>
                            )}
                            {hasAnyDeduction && (
                              <th className="py-2 px-3 font-medium text-right">수익배분</th>
                            )}
                            {hasLaborCostDed && (
                              <th className="py-2 px-3 font-medium text-right">인건비공제</th>
                            )}
                            {hasEarnedIncome && (
                              <th className="py-2 px-3 font-medium text-right">근로소득공제</th>
                            )}
                            <th className="py-2 px-3 font-medium text-right">수익정산</th>
                            <th className="py-2 px-3 font-medium text-right">수익배분율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.works.map((work) => (
                            <React.Fragment key={work.work_id}>
                              {work.details
                                .filter(d => !d.excluded)
                                .map((d, i) => (
                                  <tr key={`${work.work_id}-${d.revenue_type}`} className="border-b">
                                    <td className="py-1.5 px-3">
                                      {i === 0 ? (
                                        <div className="flex items-center gap-1.5">
                                          <span>{work.work_name}</span>
                                          {work.mg_dep_info && (
                                            <Badge variant={work.mg_dependency_blocked ? 'outline' : 'default'} className={`text-[10px] px-1.5 py-0 ${work.mg_dependency_blocked ? 'border-orange-400 text-orange-600' : 'border-green-400 text-green-600 bg-green-50'}`}>
                                              {work.mg_dependency_blocked
                                                ? `MG 의존: ${work.mg_dep_info.partner_name} (잔액 ₩${work.mg_dep_info.balance.toLocaleString()})`
                                                : `MG 소진: ${work.mg_dep_info.partner_name}`}
                                            </Badge>
                                          )}
                                        </div>
                                      ) : ''}
                                    </td>
                                    <td className="py-1.5 px-3">{d.revenue_type_label}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{d.gross_revenue.toLocaleString()}</td>
                                    {hasBaseRevenue && (
                                      <td className="py-1.5 px-3 text-right tabular-nums">{d.base_revenue.toLocaleString()}</td>
                                    )}
                                    {hasExclusion && (
                                      <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                                        {d.exclusion_amount > 0 ? `-${d.exclusion_amount.toLocaleString()}` : ''}
                                      </td>
                                    )}
                                    {(hasBaseRevenue || hasExclusion) && (
                                      <td className="py-1.5 px-3 text-right tabular-nums">{d.settlement_target.toLocaleString()}</td>
                                    )}
                                    {hasAnyDeduction && (
                                      <td className="py-1.5 px-3 text-right tabular-nums">{d.revenue_share.toLocaleString()}</td>
                                    )}
                                    {hasLaborCostDed && (
                                      <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                                        {d.team_labor_cost > 0 ? `-${d.team_labor_cost.toLocaleString()}` : ''}
                                      </td>
                                    )}
                                    {hasEarnedIncome && (
                                      <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                                        {d.self_labor_cost > 0 ? `-${d.self_labor_cost.toLocaleString()}` : ''}
                                      </td>
                                    )}
                                    <td className="py-1.5 px-3 text-right tabular-nums">
                                      {hasAnyDeduction
                                        ? d.net_share.toLocaleString()
                                        : d.revenue_share.toLocaleString()}
                                    </td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{(d.rs_rate * 100).toFixed(1)}%</td>
                                  </tr>
                                ))}
                              {/* 작품 매출 조정 → 더그림수익 컬럼 + 수익정산 컬럼 */}
                              {work.revenue_adjustments?.map(adj => (
                                <tr key={`revadj-${adj.id}`} className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                                  <td className="py-1.5 px-3"></td>
                                  <td className="py-1.5 px-3 text-sm text-amber-700 dark:text-amber-400">{adj.label}</td>
                                  <td className={`py-1.5 px-3 text-right tabular-nums text-amber-700 dark:text-amber-400`}>
                                    {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                                  </td>
                                  {midCols > 0 && <td colSpan={midCols}></td>}
                                  <td className={`py-1.5 px-3 text-right tabular-nums text-amber-700 dark:text-amber-400`}>
                                    {(() => { const rs = Math.round(adj.amount * (work.effective_rate || work.rs_rate)); return (rs >= 0 ? '+' : '') + rs.toLocaleString(); })()}
                                  </td>
                                  <td className="py-1.5 px-3"></td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                          {/* 파트너 조정 항목 → 수익정산 컬럼 */}
                          {statement.adjustments.map(adj => (
                            <tr key={adj.id} className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                              <td className="py-1.5 px-3"></td>
                              <td className="py-1.5 px-3 text-sm text-muted-foreground">
                                {adj.label}
                              </td>
                              <td></td>
                              {midCols > 0 && <td colSpan={midCols}></td>}
                              <td className={`py-1.5 px-3 text-right tabular-nums ${adj.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-3 text-center">
                                {canManage && (
                                  <button onClick={() => handleDeleteAdjustment(adj.id)} className="text-muted-foreground hover:text-red-500">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {canManage && (
                            <tr className="border-b">
                              <td colSpan={colCount} className="py-1 px-3">
                                <button
                                  onClick={() => setAdjDialogOpen(true)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                                >
                                  <Plus className="h-3 w-3" />
                                  조정 항목 추가
                                </button>
                              </td>
                            </tr>
                          )}
                          <tr className="border-t-2 font-semibold">
                            <td className="py-2 px-3">합계</td>
                            <td className="py-2 px-3"></td>
                            <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_revenue.toLocaleString()}</td>
                            {hasBaseRevenue && (
                              <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_base_revenue.toLocaleString()}</td>
                            )}
                            {hasExclusion && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                -{statement.grand_total_exclusion.toLocaleString()}
                              </td>
                            )}
                            {(hasBaseRevenue || hasExclusion) && (
                              <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_settlement_target.toLocaleString()}</td>
                            )}
                            {hasAnyDeduction && (
                              <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_share.toLocaleString()}</td>
                            )}
                            {hasLaborCostDed && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                -{statement.grand_total_team_labor_cost.toLocaleString()}
                              </td>
                            )}
                            {hasEarnedIncome && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                -{statement.grand_total_self_labor_cost.toLocaleString()}
                              </td>
                            )}
                            <td className="py-2 px-3 text-right tabular-nums">
                              {((hasAnyDeduction
                                ? statement.grand_total_net_share
                                : statement.grand_total_share) + statement.total_adjustment).toLocaleString()}
                            </td>
                            <td className="py-2 px-3"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                    );
                  })()}

                  {/* 2. 지급상세내역 */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">2. 지급상세내역</h4>
                    {(statement.partner.partner_type === 'domestic_corp' || statement.partner.partner_type === 'naver') && statement.tax_invoice ? (() => {
                        const totalMgAdj = statement.works?.reduce((s: number, w: any) => s + (w.mg_deduction_adjustment_total || 0), 0) || 0;
                        const preMgDeduction = statement.total_mg_deduction - totalMgAdj;
                        const preAdjPayment = (statement.tax_invoice_total || 0) - preMgDeduction;
                        const hasMgAdj = totalMgAdj !== 0;
                        return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left bg-muted/50">
                              <th className="py-2 px-3 font-medium">품목</th>
                              <th className="py-2 px-3 font-medium text-right">공급가액</th>
                              <th className="py-2 px-3 font-medium text-right">VAT</th>
                              <th className="py-2 px-3 font-medium text-right">합 계</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statement.tax_invoice.map((inv, i) => (
                              <tr key={i} className="border-b">
                                <td className="py-1.5 px-3">{inv.item}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums">{inv.supply.toLocaleString()}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums">{inv.vat.toLocaleString()}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{inv.total.toLocaleString()}</td>
                              </tr>
                            ))}
                            {statement.tax_invoice.length > 1 && (
                              <tr className="border-t-2 font-semibold">
                                <td className="py-2 px-3">세금계산서 합계</td>
                                <td className="py-2 px-3 text-right tabular-nums">{statement.tax_invoice.reduce((s, t) => s + t.supply, 0).toLocaleString()}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{statement.tax_invoice.reduce((s, t) => s + t.vat, 0).toLocaleString()}</td>
                                <td className="py-2 px-3 text-right tabular-nums">{(statement.tax_invoice_total || 0).toLocaleString()}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                        {statement.total_mg_deduction > 0 && (
                          <table className="w-full text-sm mt-2">
                            <tbody>
                              <tr className="border-b">
                                <td className="py-1.5 px-3 text-muted-foreground">MG차감대상</td>
                                <td className="py-1.5 px-3 text-right tabular-nums text-red-600">-{preMgDeduction.toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        )}
                        <div className="flex justify-between items-center mt-3 pt-2 border-t-2">
                          <span className="font-semibold">지급액</span>
                          {hasMgAdj ? (
                            <div className="text-right">
                              <span className="text-lg font-bold tabular-nums">{preAdjPayment.toLocaleString()}</span>
                              <div className="text-xs text-muted-foreground">MG조정 반영 후 실지급: {statement.final_payment.toLocaleString()}원</div>
                            </div>
                          ) : (
                            <span className="text-lg font-bold tabular-nums">{statement.final_payment.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                        );
                      })() : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="py-2 px-3 font-medium text-right">수익정산금</th>
                            {statement.tax_type === 'royalty' ? (
                              <>
                                <th className="py-2 px-3 font-medium text-right">사용료 (10/110)</th>
                                <th className="py-2 px-3 font-medium text-right">주민세 (1/110)</th>
                              </>
                            ) : (
                              <>
                                <th className="py-2 px-3 font-medium text-right">
                                  {statement.partner.partner_type === 'foreign_corp' ? '소득세 (20%)' : '사업소득세 (3%)'}
                                </th>
                                <th className="py-2 px-3 font-medium text-right">지방세 (10%)</th>
                              </>
                            )}
                            {(statement.insurance > 0 || insuranceExemption) && (
                              <th className="py-2 px-3 font-medium text-right">
                                예고료
                                {insuranceExemption && <span className="ml-1 text-xs text-orange-500">(면제)</span>}
                              </th>
                            )}
                            {statement.total_mg_deduction > 0 && (
                              <th className="py-2 px-3 font-medium text-right">MG 차감</th>
                            )}
                            {statement.adjustments.map(adj => (
                              <th key={adj.id} className="py-2 px-3 font-medium text-right">{adj.label}</th>
                            ))}
                            <th className="py-2 px-3 font-medium text-right">지급액</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b font-semibold">
                            <td className="py-2 px-3 text-right tabular-nums">
                              {statement.grand_total_labor_cost > 0
                                ? statement.grand_total_net_share.toLocaleString()
                                : statement.grand_total_share.toLocaleString()}
                            </td>
                            <>
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                {statement.tax_breakdown.income_tax > 0 ? `-${statement.tax_breakdown.income_tax.toLocaleString()}` : '0'}
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                {statement.tax_breakdown.local_tax > 0 ? `-${statement.tax_breakdown.local_tax.toLocaleString()}` : '0'}
                              </td>
                            </>
                            {(statement.insurance > 0 || insuranceExemption) && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                {insuranceExemption ? <span className="text-orange-500">면제</span> : `-${statement.insurance.toLocaleString()}`}
                              </td>
                            )}
                            {statement.total_mg_deduction > 0 && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                -{statement.total_mg_deduction.toLocaleString()}
                              </td>
                            )}
                            {statement.adjustments.map(adj => (
                              <td key={adj.id} className={`py-2 px-3 text-right tabular-nums ${adj.amount < 0 ? 'text-red-600' : ''}`}>
                                {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                              </td>
                            ))}
                            <td className="py-2 px-3 text-right tabular-nums text-lg">{statement.final_payment.toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>

                  {/* 예고료 면제 토글 */}
                  {canManage && statement.partner.partner_type !== 'domestic_corp' && statement.partner.partner_type !== 'naver' && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {insuranceExemption ? (
                        <>
                          <Badge variant="outline" className="text-orange-600 border-orange-300">
                            예고료 면제{insuranceExemption.reason ? ` — ${insuranceExemption.reason}` : ''}
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={handleRemoveInsuranceExemption}>
                            해제
                          </Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => setInsExemptDialogOpen(true)}>
                          + 예고료 면제
                        </Button>
                      )}
                    </div>
                  )}

                  {/* 인건비→MG 전환 안내 */}
                  {statement.total_mg_from_labor_cost > 0 && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                      인건비 → MG 전환: {statement.total_mg_from_labor_cost.toLocaleString()}원
                      <span className="ml-2 text-xs text-blue-600">(정산 확정 시 MG 엔트리로 자동 생성됩니다)</span>
                    </div>
                  )}

                  {/* MG 의존 참고자료 */}
                  {statement.mg_dep_references && statement.mg_dep_references.length > 0 && (
                    <div className="space-y-3 mt-4 pt-4 border-t">
                      <h4 className="font-semibold text-sm">참고: 의존 작가 MG 현황</h4>
                      {statement.mg_dep_references.map((ref, idx) => (
                        <div key={idx} className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {ref.work_name} — {ref.partner_name} MG
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left bg-muted/50">
                                  <th className="py-2 px-3 font-medium">월</th>
                                  <th className="py-2 px-3 font-medium text-right">이월</th>
                                  <th className="py-2 px-3 font-medium text-right">추가</th>
                                  <th className="py-2 px-3 font-medium text-right">차감</th>
                                  <th className="py-2 px-3 font-medium text-right">잔액</th>
                                </tr>
                              </thead>
                              <tbody>
                                {ref.history.map((h) => (
                                  <tr key={h.month} className="border-b">
                                    <td className="py-1.5 px-3">{h.month}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{h.previous_balance.toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{h.mg_added !== 0 ? h.mg_added.toLocaleString() : '-'}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums text-red-600">{h.mg_deducted !== 0 ? h.mg_deducted.toLocaleString() : '-'}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums font-medium">{h.current_balance.toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}
            </CardContent>
          </Card>

          {/* MG 잔액 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">MG 잔액</CardTitle>
              <div className="flex items-center gap-2">
                <Link href={`/accounting/settlement/mg/ledger?partner=${partnerId}`}>
                  <Button variant="outline" size="sm">
                    <BookOpenText className="h-3.5 w-3.5 mr-1" />
                    내역보기
                  </Button>
                </Link>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={() => setMgDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    MG 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {mgBalances.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">MG 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">작품</th>
                        <th className="py-2 px-3 font-medium text-right">이전잔액</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">MG 차감</th>
                        <th className="py-2 px-3 font-medium text-right">MG 잔액</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">메모</th>
                        {canManage && <th className="py-2 px-3 w-10"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {mgBalances.map((mg: any) => {
                        const deduction = (mg.month_deducted || 0) + (mg.pending_deduction || 0);
                        // statement의 works에서 이 작품의 MG차감 조정 내역 찾기
                        const workIds: string[] = mg.work_ids || [];
                        const mgDedAdjs = statement?.works
                          ?.filter((w: any) => workIds.includes(w.work_id))
                          ?.flatMap((w: any) => (w.mg_deduction_adjustments || []).map((a: any) => ({ ...a, work_name: w.work_name, work_id: w.work_id }))) || [];
                        return (
                        <React.Fragment key={mg.id}>
                        <tr className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">
                            <span className="flex items-center gap-1.5">
                              {mg.works || '-'}
                              {(() => {
                                const isHeld = workIds.length === 1 && statement?.works?.find((w: WorkStatement) => w.work_id === workIds[0])?.mg_hold;
                                return isHeld ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800">홀딩</span>
                                ) : null;
                              })()}
                              {canManage && workIds.length === 1 && (() => {
                                const work = statement?.works?.find((w: WorkStatement) => w.work_id === workIds[0]);
                                const isHeld = work?.mg_hold ?? false;
                                return (
                                  <button
                                    onClick={() => {
                                      setMgHoldTarget({ workId: workIds[0], workName: mg.works, currentHold: isHeld });
                                      setMgHoldDialogOpen(true);
                                    }}
                                    className={`text-muted-foreground hover:text-primary ${isHeld ? 'text-yellow-600' : ''}`}
                                    title={isHeld ? 'MG 홀딩 해제' : 'MG 차감 홀딩'}
                                  >
                                    {isHeld ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                                  </button>
                                );
                              })()}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmt(mg.previous_balance)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                            {deduction > 0 ? `-${deduction.toLocaleString()}` : '-'}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-semibold ${mg.current_balance > 0 ? 'text-orange-600' : ''}`}>
                            {fmt(mg.current_balance)}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate hidden md:table-cell" title={mg.note || ''}>
                            {mg.note || ''}
                          </td>
                          {canManage && (
                            <td className="py-2 px-3 text-center">
                              {workIds.length === 1 ? (
                                <button
                                  onClick={() => {
                                    setMgDedAdjWorkId(workIds[0]);
                                    setMgDedAdjWorkName(mg.works);
                                    setMgDedAdjDialogOpen(true);
                                  }}
                                  className="text-muted-foreground hover:text-primary"
                                  title="MG차감 조정"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              ) : workIds.length > 1 ? (
                                <span className="text-xs text-muted-foreground" title="작품이 여러 개인 엔트리는 개별 작품에서 조정하세요">-</span>
                              ) : null}
                            </td>
                          )}
                        </tr>
                        {mgDedAdjs.length > 0 && mgDedAdjs.map((adj: any) => (
                          <tr key={adj.id} className="border-b bg-yellow-50">
                            <td className="py-1 px-3 pl-6 text-xs text-muted-foreground">↳ {adj.label}</td>
                            <td className="py-1 px-3"></td>
                            <td className="py-1 px-3 text-right tabular-nums text-xs text-orange-600 hidden md:table-cell">
                              {adj.amount > 0 ? '+' : ''}{adj.amount.toLocaleString()}
                            </td>
                            <td className="py-1 px-3"></td>
                            <td className="py-1 px-3 hidden md:table-cell"></td>
                            {canManage && (
                              <td className="py-1 px-3 text-center">
                                <button onClick={() => handleDeleteMgDedAdj(adj.id)} className="text-muted-foreground hover:text-red-500">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        </React.Fragment>
                        );
                      })}
                      {mgBalances.length > 1 && (() => {
                        const totals = mgBalances.reduce((acc: any, mg: any) => ({
                          previous_balance: acc.previous_balance + (mg.previous_balance || 0),
                          deduction: acc.deduction + (mg.month_deducted || 0) + (mg.pending_deduction || 0),
                          current_balance: acc.current_balance + (mg.current_balance || 0),
                        }), { previous_balance: 0, deduction: 0, current_balance: 0 });
                        return (
                          <tr className="border-t-2 bg-muted/30 font-semibold">
                            <td className="py-2 px-3">합계</td>
                            <td className="py-2 px-3 text-right tabular-nums">{fmt(totals.previous_balance)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                              {totals.deduction > 0 ? `-${totals.deduction.toLocaleString()}` : '-'}
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums ${totals.current_balance > 0 ? 'text-orange-600' : ''}`}>
                              {fmt(totals.current_balance)}
                            </td>
                            <td className="py-2 px-3 hidden md:table-cell"></td>
                            {canManage && <td className="py-2 px-3"></td>}
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* MG 홀딩 이력 */}
          {mgHoldLogs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">MG 홀딩 이력</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">일시</th>
                        <th className="py-2 px-3 font-medium">작품</th>
                        <th className="py-2 px-3 font-medium">상태</th>
                        <th className="py-2 px-3 font-medium">사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mgHoldLogs.map((log) => {
                        const work = statement?.works?.find((w: WorkStatement) => w.work_id === log.work_id);
                        return (
                          <tr key={log.id} className="border-b">
                            <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                            <td className="py-2 px-3">{work?.work_name || log.work_id.slice(0, 8)}</td>
                            <td className="py-2 px-3">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${log.action === 'hold' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                {log.action === 'hold' ? '홀딩' : '해제'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-foreground">{log.reason || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 공제인원 (인건비공제 기반) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  공제인원 ({laborCostPersons.length}명)
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {laborCostPersons.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">인건비공제 대상이 없습니다.</div>
                )}
                {laborCostPersons.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5">
                    <span className="text-sm font-medium shrink-0">{p.person_name}</span>
                    <Badge variant={p.deduction_type === '근로소득공제' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                      {p.deduction_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {p.month} · {Number(p.amount).toLocaleString()}원
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 월별 수익 분배 추이 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">월별 수익 분배 추이</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">정산 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">월</th>
                        <th className="py-2 px-3 font-medium">작품</th>
                        <th className="py-2 px-3 font-medium text-right">수익분배금</th>
                        <th className="py-2 px-3 font-medium text-right">최종지급액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map(([month, data]) => (
                        <tr key={month} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{month}</td>
                          <td className="py-2 px-3 text-muted-foreground text-xs">
                            {data.works.join(', ') || '-'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmt(data.revenue_share)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmt(data.final_payment)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <PartnerForm
            partner={partner}
            open={formOpen}
            onOpenChange={setFormOpen}
            onSave={handleUpdate}
          />

          <ContractEditDialog
            wp={contractWp}
            open={contractDialogOpen}
            onOpenChange={setContractDialogOpen}
            onSaved={load}
          />

          <Dialog open={mgDialogOpen} onOpenChange={setMgDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>MG 추가 — {partner.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>작품</Label>
                  <Select value={mgWorkId} onValueChange={setMgWorkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="작품 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {workPartners.map((wp) => (
                        <SelectItem key={wp.work_id} value={wp.work_id}>
                          {wp.work?.name || wp.work_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>MG 금액</Label>
                  <Input type="number" value={mgAmount} onChange={(e) => setMgAmount(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label>메모</Label>
                  <Input value={mgNote} onChange={(e) => setMgNote(e.target.value)} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setMgDialogOpen(false)}>취소</Button>
                  <Button onClick={handleMgAdd} disabled={mgSaving || !mgWorkId || !mgAmount}>
                    {mgSaving ? '저장 중...' : '추가'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* MG차감 조정 추가 다이얼로그 */}
      <Dialog open={mgDedAdjDialogOpen} onOpenChange={setMgDedAdjDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>MG차감 조정 — {mgDedAdjWorkName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>사유</Label>
              <Input
                value={mgDedAdjLabel}
                onChange={(e) => setMgDedAdjLabel(e.target.value)}
                placeholder="예: 단수 조정"
              />
            </div>
            <div>
              <Label>금액 (음수=덜 차감, 양수=더 차감)</Label>
              <Input
                type="number"
                value={mgDedAdjAmount}
                onChange={(e) => setMgDedAdjAmount(e.target.value)}
                placeholder="예: -2"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMgDedAdjDialogOpen(false)}>취소</Button>
              <Button onClick={handleAddMgDedAdj} disabled={mgDedAdjSaving || !mgDedAdjLabel || !mgDedAdjAmount}>
                {mgDedAdjSaving ? '추가 중...' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MG 홀딩 다이얼로그 */}
      <Dialog open={mgHoldDialogOpen} onOpenChange={setMgHoldDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {mgHoldTarget?.currentHold ? 'MG 홀딩 해제' : 'MG 차감 홀딩'} — {mgHoldTarget?.workName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {mgHoldTarget?.currentHold
                ? '홀딩을 해제하면 다음 정산부터 MG 차감이 재개됩니다.'
                : '홀딩하면 이 작품의 MG 차감이 일시 중지됩니다.'}
            </p>
            <div>
              <Label>사유 (선택)</Label>
              <Input
                value={mgHoldReason}
                onChange={(e) => setMgHoldReason(e.target.value)}
                placeholder="예: 정산 협의 중"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMgHoldDialogOpen(false)}>취소</Button>
              <Button
                variant={mgHoldTarget?.currentHold ? 'default' : 'destructive'}
                onClick={handleMgHoldToggle}
              >
                {mgHoldTarget?.currentHold ? '해제' : '홀딩'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 조정 항목 추가 다이얼로그 */}
      <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>조정 항목 추가</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>항목명</Label>
              <Input
                value={adjLabel}
                onChange={(e) => setAdjLabel(e.target.value)}
                placeholder="예: 12월 시리즈광고 차액"
              />
            </div>
            <div>
              <Label>금액 (음수=차감)</Label>
              <Input
                type="number"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
                placeholder="예: -2877000"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjDialogOpen(false)}>취소</Button>
              <Button onClick={handleAddAdjustment} disabled={adjSaving || !adjLabel || !adjAmount}>
                {adjSaving ? '추가 중...' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={insExemptDialogOpen} onOpenChange={setInsExemptDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>예고료 면제 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedMonth}월 예고료를 면제합니다. 해당 월에만 적용됩니다.
            </p>
            <div>
              <Label>사유 (선택)</Label>
              <Input
                value={insExemptReason}
                onChange={(e) => setInsExemptReason(e.target.value)}
                placeholder="예: 특약에 의한 면제"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInsExemptDialogOpen(false)}>취소</Button>
              <Button onClick={handleAddInsuranceExemption} disabled={insExemptSaving}>
                {insExemptSaving ? '등록 중...' : '면제 등록'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
