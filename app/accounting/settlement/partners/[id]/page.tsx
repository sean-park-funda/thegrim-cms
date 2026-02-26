'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { PartnerForm } from '@/components/settlement/PartnerForm';
import { ContractEditDialog } from '@/components/settlement/ContractEditDialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Pencil, FileText, Plus } from 'lucide-react';
import { RsPartner, RsWorkPartner, RsSettlement, RsMgBalance, RsWork } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '국내법인',
  foreign_corp: '해외법인',
  naver: '네이버',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : n < 0 ? n.toLocaleString() : '-');

export default function PartnerDetailPage() {
  const router = useRouter();
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

  const [formOpen, setFormOpen] = useState(false);
  const [contractWp, setContractWp] = useState<RsWorkPartner | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);

  const [mgDialogOpen, setMgDialogOpen] = useState(false);
  const [mgWorkId, setMgWorkId] = useState('');
  const [mgAmount, setMgAmount] = useState('');
  const [mgNote, setMgNote] = useState('');
  const [mgSaving, setMgSaving] = useState(false);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const load = async () => {
    setLoading(true);
    try {
      const [partnerRes, wpRes, settRes, mgRes, worksRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/partners/${partnerId}`),
        settlementFetch(`/api/accounting/settlement/work-partners?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/settlements?partnerId=${partnerId}`),
        settlementFetch(`/api/accounting/settlement/mg?partnerId=${partnerId}`),
        settlementFetch('/api/accounting/settlement/works'),
      ]);
      const partnerData = await partnerRes.json();
      const wpData = await wpRes.json();
      const settData = await settRes.json();
      const mgData = await mgRes.json();
      const worksData = await worksRes.json();

      setPartner(partnerData.partner || null);
      setWorkPartners(wpData.work_partners || []);
      setSettlements(
        (settData.settlements || []).sort((a: RsSettlement, b: RsSettlement) => b.month.localeCompare(a.month))
      );
      setMgBalances(
        (mgData.mg_balances || []).sort((a: RsMgBalance, b: RsMgBalance) => b.month.localeCompare(a.month))
      );
      setWorks(worksData.works || []);
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
    <div className="container mx-auto p-6 space-y-6">
      <SettlementHeader />
      <SettlementNav />

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
                        <th className="py-2 px-3 font-medium text-center">MG</th>
                        <th className="py-2 px-3 font-medium">계약구분</th>
                        <th className="py-2 px-3 font-medium">계약기간</th>
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
                          <td className="py-2 px-3 text-right tabular-nums">{(wp.rs_rate * 100).toFixed(1)}%</td>
                          <td className="py-2 px-3 text-center">
                            {wp.is_mg_applied && <Badge variant="secondary" className="text-xs">MG</Badge>}
                          </td>
                          <td className="py-2 px-3 text-xs">{wp.contract_category || '-'}</td>
                          <td className="py-2 px-3 text-xs">{wp.contract_period || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                        <th className="py-2 px-3 font-medium text-right">이전잔액</th>
                        <th className="py-2 px-3 font-medium text-right">추가</th>
                        <th className="py-2 px-3 font-medium text-right">차감</th>
                        <th className="py-2 px-3 font-medium text-right">현재잔액</th>
                        <th className="py-2 px-3 font-medium">메모</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mgBalances.map((mg) => (
                        <tr key={mg.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3 font-medium">{mg.month}</td>
                          <td className="py-2 px-3">{mg.work?.name || '-'}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmt(mg.previous_balance)}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-blue-600">
                            {mg.mg_added > 0 ? `+${mg.mg_added.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-red-600">
                            {mg.mg_deducted > 0 ? `-${mg.mg_deducted.toLocaleString()}` : '-'}
                          </td>
                          <td className={`py-2 px-3 text-right tabular-nums font-semibold ${mg.current_balance > 0 ? 'text-orange-600' : ''}`}>
                            {fmt(mg.current_balance)}
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">{mg.note || ''}</td>
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
                      {works.map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
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
