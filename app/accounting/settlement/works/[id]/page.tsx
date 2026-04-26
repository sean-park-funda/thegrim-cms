'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { WorkForm } from '@/components/settlement/WorkForm';
import { ContractEditDialog } from '@/components/settlement/ContractEditDialog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Pencil, Trash2, Plus, X, Search } from 'lucide-react';
import { RsWork, RsWorkPartner, RsRevenue, RsPartner, RevenueType } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { RevenueLineDialog } from '@/components/settlement/RevenueLineDialog';

interface RevAdjustment {
  id: string;
  work_id: string;
  month: string;
  label: string;
  amount: number;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  exclusive: '독점',
  non_exclusive: '비독점',
  management: '매니지먼트',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : '-');

export default function WorkDetailPage() {
  const params = useParams();
  const workId = params.id as string;
  const { profile } = useStore();

  const [work, setWork] = useState<RsWork | null>(null);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [revAdjustments, setRevAdjustments] = useState<RevAdjustment[]>([]);
  const [partners, setPartners] = useState<RsPartner[]>([]);
  const [mgBalances, setMgBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [contractWp, setContractWp] = useState<RsWorkPartner | null>(null);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);

  const [adjDialogOpen, setAdjDialogOpen] = useState(false);
  const [adjMonth, setAdjMonth] = useState('');
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);

  const [lineDialogOpen, setLineDialogOpen] = useState(false);
  const [lineDialogMonth, setLineDialogMonth] = useState('');
  const [lineDialogType, setLineDialogType] = useState('');

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkPartnerId, setLinkPartnerId] = useState('');
  const [linkRate, setLinkRate] = useState('0.7');
  const [linkMg, setLinkMg] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [workRes, wpRes, revRes, partnersRes, mgRes, adjRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/works/${workId}`),
        settlementFetch(`/api/accounting/settlement/work-partners?workId=${workId}`),
        settlementFetch(`/api/accounting/settlement/revenue?workId=${workId}`),
        settlementFetch(`/api/accounting/settlement/partners`),
        settlementFetch(`/api/accounting/settlement/mg?workId=${workId}`),
        settlementFetch(`/api/accounting/settlement/revenue-adjustments?work_id=${workId}`),
      ]);
      const workData = await workRes.json();
      const wpData = await wpRes.json();
      const revData = await revRes.json();
      const partnersData = await partnersRes.json();
      const mgData = await mgRes.json();
      const adjData = await adjRes.json();
      setWork(workData.work || null);
      setWorkPartners(wpData.work_partners || []);
      setRevenues((revData.revenues || []).sort((a: RsRevenue, b: RsRevenue) => b.month.localeCompare(a.month)));
      setRevAdjustments(adjData.adjustments || []);
      setPartners(partnersData.partners || []);
      setMgBalances((mgData.mg_balances || []).sort((a: any, b: any) => b.month.localeCompare(a.month)));
    } catch (e) {
      console.error('작품 상세 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role) && workId) {
      load();
    }
  }, [profile, workId]);

  const handleUpdate = async (data: Partial<RsWork>) => {
    const res = await settlementFetch(`/api/accounting/settlement/works/${workId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleUnlink = async (id: string) => {
    if (!confirm('연결을 해제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/work-partners?id=${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const handleLinkPartner = async () => {
    if (!linkPartnerId) return;
    setLinkSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/work-partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_id: workId,
          partner_id: linkPartnerId,
          rs_rate: parseFloat(linkRate),
          is_mg_applied: linkMg,
        }),
      });
      if (res.ok) {
        setLinkDialogOpen(false);
        setLinkPartnerId('');
        setLinkRate('0.7');
        setLinkMg(false);
        await load();
      } else {
        const err = await res.json();
        alert(err.error || '파트너 추가 실패');
      }
    } catch (e) {
      console.error('파트너 추가 오류:', e);
    } finally {
      setLinkSaving(false);
    }
  };

  const handleAddAdj = async () => {
    if (!adjMonth || !adjLabel || !adjAmount) return;
    setAdjSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/revenue-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_id: workId, month: adjMonth, label: adjLabel, amount: Number(adjAmount) }),
      });
      if (res.ok) {
        setAdjDialogOpen(false);
        setAdjLabel('');
        setAdjAmount('');
        await load();
      }
    } finally {
      setAdjSaving(false);
    }
  };

  const handleDeleteAdj = async (adjId: string) => {
    if (!confirm('매출 조정 항목을 삭제하시겠습니까?')) return;
    const res = await settlementFetch('/api/accounting/settlement/revenue-adjustments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: adjId }),
    });
    if (res.ok) await load();
  };

  const availablePartners = partners.filter(
    (p) => !workPartners.some((wp) => wp.partner_id === p.id)
  );

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/accounting/settlement/works">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            작품 목록
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      ) : !work ? (
        <div className="text-sm text-muted-foreground py-8 text-center">작품을 찾을 수 없습니다.</div>
      ) : (
        <>
          {/* 작품 기본 정보 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <CardTitle>{work.name}</CardTitle>
                  {work.naver_name && work.naver_name !== work.name && (
                    <span className="text-sm text-muted-foreground">({work.naver_name})</span>
                  )}
                  <Badge variant="secondary">{CONTRACT_TYPE_LABELS[work.contract_type] || work.contract_type}</Badge>
                  {!work.is_active && <Badge variant="outline">비활성</Badge>}
                </div>
                {(work.serial_start_date || work.serial_end_date) && (
                  <p className="text-sm text-muted-foreground mt-1">
                    연재 기간: {work.serial_start_date || '?'} ~ {work.serial_end_date || '연재중'}
                  </p>
                )}
              </div>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  수정
                </Button>
              )}
            </CardHeader>
            {work.note && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{work.note}</p>
              </CardContent>
            )}
          </Card>

          {/* 월별 매출 추이 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">월별 매출 추이</CardTitle>
              {canManage && <p className="text-xs text-muted-foreground mt-1">매출 항목을 클릭하면 확정/미확정 상태를 변경할 수 있습니다.</p>}
            </CardHeader>
            <CardContent>
              {revenues.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">매출 데이터가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">월</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">국내유료</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">글로벌유료</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">국내광고</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">글로벌광고</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">2차사업</th>
                        <th className="py-2 px-3 font-medium text-right">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenues.map((r) => {
                        const unc = r.unconfirmed_types || [];
                        const monthAdjs = revAdjustments.filter(a => a.month === r.month);
                        const adjTotal = monthAdjs.reduce((s, a) => s + a.amount, 0);
                        const TYPE_LABELS: Record<RevenueType, string> = {
                          domestic_paid: '국내유료', global_paid: '글로벌유료',
                          domestic_ad: '국내광고', global_ad: '글로벌광고', secondary: '2차사업',
                        };
                        const toggleUnconfirmed = async (type: RevenueType) => {
                          if (!canManage) return;
                          const isCurrentlyUnconfirmed = unc.includes(type);
                          const action = isCurrentlyUnconfirmed ? '확정' : '미확정';
                          if (!confirm(`${r.month} ${TYPE_LABELS[type]} 항목을 ${action} 처리하시겠습니까?`)) return;
                          const next: RevenueType[] = isCurrentlyUnconfirmed ? unc.filter(t => t !== type) : [...unc, type];
                          try {
                            const res = await settlementFetch('/api/accounting/settlement/revenue', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: r.id, unconfirmed_types: next }),
                            });
                            if (res.ok) {
                              setRevenues(prev => prev.map(rev =>
                                rev.id === r.id ? { ...rev, unconfirmed_types: next } : rev
                              ));
                            }
                          } catch (e) {
                            console.error('미확정 상태 변경 오류:', e);
                          }
                        };
                        const cellClass = (type: RevenueType) =>
                          `py-2 px-3 text-right tabular-nums hidden md:table-cell ${canManage ? 'cursor-pointer hover:bg-muted' : ''} ${unc.includes(type) ? 'line-through text-orange-400' : ''}`;
                        const openLineDialog = (type: RevenueType, e: React.MouseEvent) => {
                          e.stopPropagation();
                          setLineDialogMonth(r.month);
                          setLineDialogType(type);
                          setLineDialogOpen(true);
                        };
                        const hasLineDetail = (type: RevenueType) => type === 'global_paid';
                        const renderCell = (type: RevenueType, value: number) => (
                          <td className={cellClass(type)} onClick={() => toggleUnconfirmed(type)}>
                            <span className="inline-flex items-center gap-1 justify-end">
                              {fmt(value)}
                              {hasLineDetail(type) && value > 0 && (
                                <button
                                  onClick={(e) => openLineDialog(type, e)}
                                  className="text-muted-foreground hover:text-primary"
                                  title="상세 보기"
                                >
                                  <Search className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          </td>
                        );
                        return (
                          <React.Fragment key={r.month}>
                            <tr className="border-b hover:bg-muted/50">
                              <td className="py-2 px-3 font-medium">
                                {r.month}
                                {unc.length > 0 && <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0 text-orange-500 border-orange-300">미확정 {unc.length}</Badge>}
                              </td>
                              {renderCell('domestic_paid', r.domestic_paid)}
                              {renderCell('global_paid', r.global_paid)}
                              {renderCell('domestic_ad', r.domestic_ad)}
                              {renderCell('global_ad', r.global_ad)}
                              {renderCell('secondary', r.secondary)}
                              <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmt(r.total + adjTotal)}</td>
                            </tr>
                            {monthAdjs.map((adj) => (
                              <tr key={adj.id} className="border-b bg-amber-50 dark:bg-amber-950/20">
                                <td className="py-1 px-3 text-xs text-amber-700 dark:text-amber-400" colSpan={6}>
                                  <span className="inline-flex items-center gap-1">
                                    <span>↳ {adj.label}</span>
                                    {canManage && (
                                      <button onClick={() => handleDeleteAdj(adj.id)} className="hover:text-red-500">
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </span>
                                </td>
                                <td className="py-1 px-3 text-right text-xs tabular-nums text-amber-700 dark:text-amber-400">
                                  {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                            {canManage && (
                              <tr className="border-b">
                                <td colSpan={7} className="py-1 px-3">
                                  <button
                                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5"
                                    onClick={() => { setAdjMonth(r.month); setAdjDialogOpen(true); }}
                                  >
                                    <Plus className="h-3 w-3" /> 매출 조정 추가
                                  </button>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 계약 파트너 목록 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">계약 파트너 ({workPartners.length}명)</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setLinkDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  파트너 추가
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {workPartners.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">연결된 파트너가 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-3 font-medium">파트너</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">필명</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">매출액적용율</th>
                        <th className="py-2 px-3 font-medium text-right">RS 요율</th>
                        <th className="py-2 px-3 font-medium text-right">MG 잔액</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약구분</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">계약기간</th>
                        {canManage && <th className="py-2 px-3 font-medium"></th>}
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
                              href={`/accounting/settlement/partners/${wp.partner_id}`}
                              className="text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {wp.partner?.name || wp.partner_id}
                            </Link>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{wp.pen_name || '-'}</td>
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                            {`${((wp.revenue_rate ?? 1) * 100).toFixed(0)}%`}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {(wp.rs_rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {(() => {
                              const latestMg = mgBalances
                                .filter(mg => mg.partner_id === wp.partner_id)
                                .sort((a, b) => b.month.localeCompare(a.month))[0];
                              return latestMg ? fmt(latestMg.current_balance) : '-';
                            })()}
                          </td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_category || '-'}</td>
                          <td className="py-2 px-3 text-xs hidden md:table-cell">{wp.contract_period || '-'}</td>
                          {canManage && (
                            <td className="py-2 px-3">
                              <span className="inline-flex items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setContractWp(wp);
                                    setContractDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnlink(wp.id);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </span>
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

          <WorkForm
            work={work}
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

          <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>매출 조정 추가 ({adjMonth})</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>항목명</Label>
                  <Input value={adjLabel} onChange={(e) => setAdjLabel(e.target.value)} placeholder="예: 12월 시리즈광고 차액" />
                </div>
                <div className="space-y-2">
                  <Label>금액 (음수 가능)</Label>
                  <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="예: 3 또는 -2877000" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setAdjDialogOpen(false)}>취소</Button>
                  <Button onClick={handleAddAdj} disabled={!adjLabel || !adjAmount || adjSaving}>
                    {adjSaving ? '저장 중...' : '추가'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>파트너 추가</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>파트너 선택</Label>
                  <Select value={linkPartnerId} onValueChange={setLinkPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="파트너를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePartners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.company_name ? ` (${p.company_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>RS 요율</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={linkRate}
                      onChange={(e) => setLinkRate(e.target.value)}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">
                      ({(parseFloat(linkRate || '0') * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="link-mg"
                    checked={linkMg}
                    onCheckedChange={(c) => setLinkMg(c === true)}
                  />
                  <Label htmlFor="link-mg" className="cursor-pointer">MG 적용</Label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
                    취소
                  </Button>
                  <Button onClick={handleLinkPartner} disabled={!linkPartnerId || linkSaving}>
                    {linkSaving ? '저장 중...' : '추가'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {work && (
            <RevenueLineDialog
              open={lineDialogOpen}
              onOpenChange={setLineDialogOpen}
              workId={workId}
              workName={work.name}
              month={lineDialogMonth}
              revenueType={lineDialogType}
              canManage={canManage}
              onUpdated={load}
            />
          )}
        </>
      )}
    </div>
  );
}
