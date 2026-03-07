'use client';

import { useEffect, useState } from 'react';
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
import { ArrowLeft, Pencil, FileText, Plus, ChevronDown, ChevronRight, Trash2, Users } from 'lucide-react';
import { StaffForm } from '@/components/settlement/StaffForm';
import { StaffAssignmentDialog } from '@/components/settlement/StaffAssignmentDialog';
import { RsPartner, RsWorkPartner, RsSettlement, RsMgBalance, RsWork, RsStaff, RsStaffAssignment } from '@/lib/types/settlement';
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
  revenue_share: number;
  rs_rate: number;
}

interface WorkStatement {
  work_name: string;
  work_id: string;
  rs_rate: number;
  is_mg_applied: boolean;
  details: WorkDetail[];
  work_total_revenue: number;
  work_total_share: number;
  mg_balance: number;
  mg_deduction: number;
  mg_remaining: number;
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
  grand_total_share: number;
  tax_breakdown: TaxBreakdown;
  tax_amount: number;
  total_mg_deduction: number;
  final_payment: number;
  mg_history?: MgWorkHistory[];
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '국내법인',
  foreign_corp: '해외법인',
  naver: '네이버',
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
  const [mgBalances, setMgBalances] = useState<RsMgBalance[]>([]);
  const [works, setWorks] = useState<RsWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const [staffList, setStaffList] = useState<RsStaff[]>([]);
  const [staffAssignments, setStaffAssignments] = useState<RsStaffAssignment[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [contractWp, setContractWp] = useState<RsWorkPartner | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);

  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<RsStaff | null>(null);
  const [staffAssignDialogOpen, setStaffAssignDialogOpen] = useState(false);
  const [editStaffAssignment, setEditStaffAssignment] = useState<RsStaffAssignment | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  const [mgHistoryOpen, setMgHistoryOpen] = useState(false);
  const [mgDialogOpen, setMgDialogOpen] = useState(false);
  const [mgWorkId, setMgWorkId] = useState('');
  const [mgAmount, setMgAmount] = useState('');
  const [mgNote, setMgNote] = useState('');
  const [mgSaving, setMgSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [partnerRes, wpRes, settRes, mgRes, worksRes, staffRes, partnersRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/partners/${partnerId}`),
        settlementFetch(`/api/accounting/settlement/work-partners?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/settlements?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}`),
        settlementFetch('/api/accounting/settlement/works'),
        settlementFetch(`/api/accounting/settlement/staff?partnerId=${partnerId}&activeOnly=false`),
        settlementFetch('/api/accounting/settlement/partners'),
      ]);
      const partnerData = await partnerRes.json();
      const wpData = await wpRes.json();
      const settData = await settRes.json();
      const mgData = await mgRes.json();
      const worksData = await worksRes.json();
      const staffData = await staffRes.json();
      const partnersData = await partnersRes.json();

      setPartner(partnerData.partner || null);
      setWorkPartners(wpData.work_partners || []);
      setSettlements(
        (settData.settlements || []).sort((a: RsSettlement, b: RsSettlement) => b.month.localeCompare(a.month))
      );
      setMgBalances(
        (mgData.mg_balances || []).sort((a: RsMgBalance, b: RsMgBalance) => b.month.localeCompare(a.month))
      );
      setWorks(worksData.works || []);
      setPartners(partnersData.partners || []);

      const staffMembers: RsStaff[] = staffData.staff || [];
      setStaffList(staffMembers);

      // Load assignments for all staff members
      if (staffMembers.length > 0) {
        const assignResults = await Promise.all(
          staffMembers.map(s => settlementFetch(`/api/accounting/settlement/staff-assignments?staffId=${s.id}`))
        );
        const allAssignments: RsStaffAssignment[] = [];
        for (const r of assignResults) {
          const d = await r.json();
          allAssignments.push(...(d.assignments || []));
        }
        setStaffAssignments(allAssignments);
      } else {
        setStaffAssignments([]);
      }
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
  }, [profile, partnerId, selectedMonth]);

  const handleUpdate = async (data: Partial<RsPartner>) => {
    const res = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleCreateStaff = async (data: Partial<RsStaff>) => {
    const res = await settlementFetch('/api/accounting/settlement/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, employer_partner_id: partnerId, employer_type: 'author' }),
    });
    if (res.ok) await load();
  };

  const handleUpdateStaff = async (data: Partial<RsStaff>) => {
    if (!editStaff) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff/${editStaff.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditStaff(null);
      await load();
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm('이 인력을 삭제하시겠습니까? 모든 배정 정보도 함께 삭제됩니다.')) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const handleDeleteStaffAssignment = async (id: string) => {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/staff-assignments?id=${id}`, { method: 'DELETE' });
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
                <Link href={`/accounting/settlement/partners/${partnerId}/statement`}>
                  <Button variant="outline" size="sm">
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    정산서
                  </Button>
                </Link>
                {canManage && (
                  <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    수정
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">세율: </span>
                  <span className="font-medium">{(partner.tax_rate * 100).toFixed(1)}%</span>
                </div>
                {partner.tax_id && (
                  <div>
                    <span className="text-muted-foreground">사업자번호: </span>
                    <span className="font-medium">{partner.tax_id}</span>
                  </div>
                )}
                {partner.email && (
                  <div>
                    <span className="text-muted-foreground">이메일: </span>
                    <span className="font-medium">{partner.email}</span>
                  </div>
                )}
                {partner.bank_name && (
                  <div>
                    <span className="text-muted-foreground">은행: </span>
                    <span className="font-medium">{partner.bank_name} {partner.bank_account}</span>
                  </div>
                )}
              </div>
              {partner.note && (
                <p className="text-sm text-muted-foreground mt-2">{partner.note}</p>
              )}
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
                        <th className="py-2 px-3 font-medium text-right">RS 요율</th>
                        <th className="py-2 px-3 font-medium text-right">MG 잔액</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약구분</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약기간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workPartners.map((wp) => (
                        <tr
                          key={wp.id}
                          className={`border-b hover:bg-muted/50 ${canManage ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (canManage) {
                              setContractWp(wp);
                              setContractDialogOpen(true);
                            }
                          }}
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
                          <td className="py-2 px-3 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              {(wp.rs_rate * 100).toFixed(1)}%
                              {canManage && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContractWp(wp);
                                    setContractDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {(() => {
                              const latestMg = mgBalances
                                .filter(mg => mg.work_id === wp.work_id)
                                .sort((a, b) => b.month.localeCompare(a.month))[0];
                              return latestMg ? fmt(latestMg.current_balance) : '-';
                            })()}
                          </td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_category || '-'}</td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_period || '-'}</td>
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
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">1. 정산상세내역</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="py-2 px-3 font-medium">작품 구분</th>
                            <th className="py-2 px-3 font-medium">수익구분</th>
                            <th className="py-2 px-3 font-medium text-right">더그림수익</th>
                            <th className="py-2 px-3 font-medium text-right">수익정산</th>
                            <th className="py-2 px-3 font-medium text-right">수익배분율</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.works.map((work) =>
                            work.details
                              .filter(d => d.gross_revenue > 0)
                              .map((d, i) => (
                                <tr key={`${work.work_id}-${d.revenue_type}`} className="border-b">
                                  <td className="py-1.5 px-3">{i === 0 ? work.work_name : ''}</td>
                                  <td className="py-1.5 px-3">{d.revenue_type_label}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{d.gross_revenue.toLocaleString()}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{d.revenue_share.toLocaleString()}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{(d.rs_rate * 100).toFixed(1)}%</td>
                                </tr>
                              ))
                          )}
                          <tr className="border-t-2 font-semibold">
                            <td className="py-2 px-3">합계</td>
                            <td className="py-2 px-3"></td>
                            <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_revenue.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_share.toLocaleString()}</td>
                            <td className="py-2 px-3"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 2. 지급상세내역 */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">2. 지급상세내역</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left bg-muted/50">
                            <th className="py-2 px-3 font-medium text-right">수익정산금</th>
                            {statement.partner.partner_type === 'domestic_corp' ? (
                              <th className="py-2 px-3 font-medium text-right">부가세 (10%)</th>
                            ) : (
                              <>
                                <th className="py-2 px-3 font-medium text-right">
                                  {statement.partner.partner_type === 'foreign_corp' ? '소득세 (20%)' : '사업소득세 (3%)'}
                                </th>
                                <th className="py-2 px-3 font-medium text-right">지방세 (10%)</th>
                              </>
                            )}
                            {statement.total_mg_deduction > 0 && (
                              <th className="py-2 px-3 font-medium text-right">MG 차감</th>
                            )}
                            <th className="py-2 px-3 font-medium text-right">지급액</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b font-semibold">
                            <td className="py-2 px-3 text-right tabular-nums">{statement.grand_total_share.toLocaleString()}</td>
                            {statement.partner.partner_type === 'domestic_corp' ? (
                              <td className="py-2 px-3 text-right tabular-nums">
                                {statement.tax_breakdown.vat > 0 ? statement.tax_breakdown.vat.toLocaleString() : '0'}
                              </td>
                            ) : (
                              <>
                                <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                  {statement.tax_breakdown.income_tax > 0 ? `-${statement.tax_breakdown.income_tax.toLocaleString()}` : '0'}
                                </td>
                                <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                  {statement.tax_breakdown.local_tax > 0 ? `-${statement.tax_breakdown.local_tax.toLocaleString()}` : '0'}
                                </td>
                              </>
                            )}
                            {statement.total_mg_deduction > 0 && (
                              <td className="py-2 px-3 text-right tabular-nums text-red-600">
                                -{statement.total_mg_deduction.toLocaleString()}
                              </td>
                            )}
                            <td className="py-2 px-3 text-right tabular-nums text-lg">{statement.final_payment.toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. MG 정산 */}
                  {statement.works.some(w => w.is_mg_applied && w.mg_balance > 0) && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">3. MG 정산</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left bg-muted/50">
                              <th className="py-2 px-3 font-medium">작품명</th>
                              <th className="py-2 px-3 font-medium text-right">잔액</th>
                              <th className="py-2 px-3 font-medium text-right">MG 차감</th>
                              <th className="py-2 px-3 font-medium text-right">차감 후 잔액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statement.works
                              .filter(w => w.is_mg_applied && w.mg_balance > 0)
                              .map(w => (
                                <tr key={w.work_id} className="border-b">
                                  <td className="py-1.5 px-3">{w.work_name}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{w.mg_balance.toLocaleString()}</td>
                                  <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                                    {w.mg_deduction !== 0 ? w.mg_deduction.toLocaleString() : '0'}
                                  </td>
                                  <td className="py-1.5 px-3 text-right tabular-nums">{w.mg_remaining.toLocaleString()}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>

                      {/* MG 전체 이력 (접기/펼치기) */}
                      {statement.mg_history && statement.mg_history.length > 0 && (
                        <div className="mt-3">
                          <button
                            onClick={() => setMgHistoryOpen(!mgHistoryOpen)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {mgHistoryOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            MG 전체 이력 {mgHistoryOpen ? '접기' : '펼치기'}
                          </button>
                          {mgHistoryOpen && (
                            <div className="mt-2 space-y-3">
                              {statement.mg_history.map((wh) => (
                                <div key={wh.work_name}>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{wh.work_name}</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b bg-muted/30">
                                        <th className="py-1 px-2 text-left">월</th>
                                        <th className="py-1 px-2 text-right hidden md:table-cell">전월이월</th>
                                        <th className="py-1 px-2 text-right">MG 추가</th>
                                        <th className="py-1 px-2 text-right">MG 차감</th>
                                        <th className="py-1 px-2 text-right">잔액</th>
                                        <th className="py-1 px-2 text-left hidden md:table-cell">비고</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {wh.history.map((h) => (
                                        <tr key={h.month} className="border-b">
                                          <td className="py-1 px-2">{h.month}</td>
                                          <td className="py-1 px-2 text-right tabular-nums hidden md:table-cell">{h.previous_balance.toLocaleString()}</td>
                                          <td className="py-1 px-2 text-right tabular-nums text-blue-600">
                                            {h.mg_added > 0 ? `+${h.mg_added.toLocaleString()}` : '-'}
                                          </td>
                                          <td className="py-1 px-2 text-right tabular-nums text-red-600">
                                            {h.mg_deducted > 0 ? `-${h.mg_deducted.toLocaleString()}` : '-'}
                                          </td>
                                          <td className="py-1 px-2 text-right tabular-nums font-medium">{h.current_balance.toLocaleString()}</td>
                                          <td className="py-1 px-2 text-muted-foreground hidden md:table-cell">{h.note}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setMgDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  MG 추가
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {mgBalances.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">MG 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">월</th>
                        <th className="py-2 px-3 font-medium">작품</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">이전잔액</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">추가</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">차감</th>
                        <th className="py-2 px-3 font-medium text-right">현재잔액</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">특이사항</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mgBalances.map((mg) => (
                        <tr key={mg.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{mg.month}</td>
                          <td className="py-2 px-3">{mg.work?.name || '-'}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(mg.previous_balance)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-blue-600 hidden md:table-cell">
                            {mg.mg_added > 0 ? `+${mg.mg_added.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                            {mg.mg_deducted > 0 ? `-${mg.mg_deducted.toLocaleString()}` : '-'}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-semibold ${mg.current_balance > 0 ? 'text-orange-600' : ''}`}>
                            {fmt(mg.current_balance)}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate hidden md:table-cell" title={mg.note || ''}>
                            {mg.note || ''}
                          </td>
                        </tr>
                      ))}
                      {/* 합계행 - 최신 월 기준 */}
                      {(() => {
                        const latestMonth = mgBalances[0]?.month;
                        if (!latestMonth) return null;
                        const latestItems = mgBalances.filter(mg => mg.month === latestMonth);
                        const totals = latestItems.reduce((acc, mg) => ({
                          previous_balance: acc.previous_balance + mg.previous_balance,
                          mg_added: acc.mg_added + mg.mg_added,
                          mg_deducted: acc.mg_deducted + mg.mg_deducted,
                          current_balance: acc.current_balance + mg.current_balance,
                        }), { previous_balance: 0, mg_added: 0, mg_deducted: 0, current_balance: 0 });
                        return (
                          <tr className="border-t-2 bg-muted/30 font-semibold">
                            <td className="py-2 px-3">{latestMonth}</td>
                            <td className="py-2 px-3">합계</td>
                            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.previous_balance)}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-blue-600 hidden md:table-cell">
                              {totals.mg_added > 0 ? `+${totals.mg_added.toLocaleString()}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                              {totals.mg_deducted > 0 ? `-${totals.mg_deducted.toLocaleString()}` : '-'}
                            </td>
                            <td className={`py-2 px-3 text-right tabular-nums ${totals.current_balance > 0 ? 'text-orange-600' : ''}`}>
                              {fmt(totals.current_balance)}
                            </td>
                            <td className="py-2 px-3 hidden md:table-cell"></td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 소속 인력 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  소속 인력 ({staffList.length}명)
                </div>
              </CardTitle>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => { setEditStaff(null); setStaffFormOpen(true); }}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  인력 추가
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {staffList.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">소속 인력이 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {staffList.map((s) => {
                    const sAssignments = staffAssignments.filter(a => a.staff_id === s.id);
                    const totalCost = sAssignments.reduce((sum, a) => sum + (Number(a.monthly_cost) || 0), 0);
                    return (
                      <div key={s.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/accounting/settlement/staff/${s.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {s.name}
                            </Link>
                            {!s.is_active && <Badge variant="outline">비활성</Badge>}
                            {totalCost > 0 && (
                              <span className="text-xs text-muted-foreground">월 {totalCost.toLocaleString()}원</span>
                            )}
                          </div>
                          {canManage && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedStaffId(s.id);
                                  setEditStaffAssignment(null);
                                  setStaffAssignDialogOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                배정
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditStaff(s); setStaffFormOpen(true); }}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteStaff(s.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {sAssignments.length > 0 && (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-xs text-muted-foreground">
                                <th className="py-1 px-2 font-medium">작품</th>
                                <th className="py-1 px-2 font-medium text-right">월 비용</th>
                                <th className="py-1 px-2 font-medium hidden md:table-cell">기간</th>
                                {canManage && <th className="py-1 px-2 font-medium w-8"></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {sAssignments.map((a) => (
                                <tr
                                  key={a.id}
                                  className={`border-b last:border-0 hover:bg-muted/50 ${canManage ? 'cursor-pointer' : ''}`}
                                  onClick={() => {
                                    if (canManage) {
                                      setSelectedStaffId(s.id);
                                      setEditStaffAssignment(a);
                                      setStaffAssignDialogOpen(true);
                                    }
                                  }}
                                >
                                  <td className="py-1 px-2">
                                    <Link
                                      href={`/accounting/settlement/works/${a.work_id}`}
                                      className="text-primary hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {(a.work as { name?: string } | null)?.name || a.work_id}
                                    </Link>
                                  </td>
                                  <td className="py-1 px-2 text-right tabular-nums">
                                    {Number(a.monthly_cost) > 0 ? Number(a.monthly_cost).toLocaleString() : '-'}
                                  </td>
                                  <td className="py-1 px-2 text-xs text-muted-foreground hidden md:table-cell">
                                    {a.start_month || '?'} ~ {a.end_month || '진행중'}
                                  </td>
                                  {canManage && (
                                    <td className="py-1 px-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={(e) => { e.stopPropagation(); handleDeleteStaffAssignment(a.id); }}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
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

          <StaffForm
            staff={editStaff}
            partners={partners}
            open={staffFormOpen}
            onOpenChange={setStaffFormOpen}
            onSave={editStaff ? handleUpdateStaff : handleCreateStaff}
          />

          {selectedStaffId && (
            <StaffAssignmentDialog
              staffId={selectedStaffId}
              employerPartnerId={partnerId}
              assignment={editStaffAssignment}
              existingWorkIds={staffAssignments.filter(a => a.staff_id === selectedStaffId).map(a => a.work_id)}
              open={staffAssignDialogOpen}
              onOpenChange={setStaffAssignDialogOpen}
              onSaved={load}
            />
          )}

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
    </div>
  );
}
