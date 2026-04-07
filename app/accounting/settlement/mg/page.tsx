'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Search, Pencil, Users, BookOpen, History, BarChart3, BookOpenText } from 'lucide-react';
import { RsMgBalance, RsWorkPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '사업자(국내)',
  foreign_corp: '사업자(해외)',
  naver: '사업자(네이버)',
};

const fmt = (n: number) => (n > 0 ? n.toLocaleString() : n < 0 ? n.toLocaleString() : '-');

export default function MgPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [mgBalances, setMgBalances] = useState<RsMgBalance[]>([]);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'partner' | 'work'>('partner');

  // 편집 다이얼로그
  const [editMg, setEditMg] = useState<RsMgBalance | null>(null);
  const [editMonthNote, setEditMonthNote] = useState('');
  const [editCondition, setEditCondition] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [mgRes, wpRes] = await Promise.all([
        settlementFetch(`/api/accounting/settlement/mg?month=${selectedMonth}`),
        settlementFetch('/api/accounting/settlement/work-partners'),
      ]);
      const mgData = await mgRes.json();
      const wpData = await wpRes.json();

      setMgBalances(mgData.mg_balances || []);
      setWorkPartners(wpData.work_partners || []);
    } catch (e) {
      console.error('MG 현황 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile, selectedMonth]);

  // 풀의 작품 ID 목록에서 work-partner 찾기
  const getPoolWorkIds = (mg: RsMgBalance): string[] => {
    const poolWorks = (mg as any).pool_works || [];
    return poolWorks.map((pw: any) => pw.work_id).filter(Boolean);
  };

  const getWpNote = (partnerId: string, mgEntry: RsMgBalance) => {
    const poolWorkIds = getPoolWorkIds(mgEntry);
    // 풀 내 첫 번째 work-partner의 note 사용
    for (const wid of poolWorkIds) {
      const wp = workPartners.find(w => w.partner_id === partnerId && w.work_id === wid);
      if (wp?.note) return wp.note;
    }
    // 하위호환: 직접 work_id로도 시도
    const wp = workPartners.find(w => w.partner_id === partnerId && w.work_id === mgEntry.work_id);
    return wp?.note || '';
  };

  const getWpId = (partnerId: string, mgEntry: RsMgBalance) => {
    const poolWorkIds = getPoolWorkIds(mgEntry);
    for (const wid of poolWorkIds) {
      const wp = workPartners.find(w => w.partner_id === partnerId && w.work_id === wid);
      if (wp) return wp.id;
    }
    const wp = workPartners.find(w => w.partner_id === partnerId && w.work_id === mgEntry.work_id);
    return wp?.id;
  };

  const openEdit = (mg: RsMgBalance) => {
    setEditMg(mg);
    setEditMonthNote(mg.note || '');
    setEditCondition(getWpNote(mg.partner_id, mg));
  };

  const handleSave = async () => {
    if (!editMg) return;
    setSaving(true);
    try {
      // 1) 월별 메모 업데이트 (rs_mg_balances.note)
      await settlementFetch('/api/accounting/settlement/mg', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editMg.id,
          note: editMonthNote || null,
        }),
      });

      // 2) 상시 MG 조건 업데이트 (rs_work_partners.note)
      const wpId = getWpId(editMg.partner_id, editMg);
      if (wpId) {
        await settlementFetch('/api/accounting/settlement/work-partners', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: wpId,
            note: editCondition || null,
          }),
        });
      }

      setEditMg(null);
      await load();
    } catch (e) {
      console.error('저장 오류:', e);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  const searched = search
    ? mgBalances.filter(mg =>
        (mg.partner?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (mg.partner?.company_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (mg.work?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : mgBalances;

  const filtered = [...searched].sort((a, b) =>
    viewMode === 'work'
      ? (a.work?.name || '').localeCompare(b.work?.name || '', 'ko')
      : (a.partner?.name || '').localeCompare(b.partner?.name || '', 'ko')
  );

  const totals = filtered.reduce(
    (acc, mg) => ({
      previous_balance: acc.previous_balance + mg.previous_balance,
      mg_added: acc.mg_added + mg.mg_added,
      mg_deducted: acc.mg_deducted + mg.mg_deducted,
      current_balance: acc.current_balance + mg.current_balance,
    }),
    { previous_balance: 0, mg_added: 0, mg_deducted: 0, current_balance: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-2">
        <Button variant="default" size="sm" className="gap-1.5">
          <BarChart3 className="h-4 w-4" />
          집계
        </Button>
        <Link href="/accounting/settlement/mg/ledger">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <BookOpenText className="h-4 w-4" />
            원장
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>MG현황 집계 ({selectedMonth})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === 'partner' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-r-none gap-1"
                onClick={() => setViewMode('partner')}
              >
                <Users className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">파트너별</span>
              </Button>
              <Button
                variant={viewMode === 'work' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 rounded-l-none gap-1"
                onClick={() => setViewMode('work')}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">작품별</span>
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="파트너, 거래처, 작품 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-60"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : mgBalances.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">MG 데이터가 없습니다.</div>
          ) : (
            <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {filtered.map((mg) => {
                const condition = getWpNote(mg.partner_id, mg);
                return (
                  <div key={mg.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        {viewMode === 'work' ? (
                          <>
                            <Link
                              href={`/accounting/settlement/works/${mg.work_id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {mg.work?.name || '-'}
                            </Link>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/accounting/settlement/partners/${mg.partner_id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {mg.partner?.name || '-'}
                            </Link>
                            <Badge variant="secondary" className="text-xs ml-2">
                              {PARTNER_TYPE_LABELS[mg.partner?.partner_type || ''] || '-'}
                            </Badge>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Link href={`/accounting/settlement/mg/history?partnerId=${mg.partner_id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        {canManage && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(mg)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {viewMode === 'work' ? (mg.partner?.name || '-') : (mg.work?.name || '-')}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">전월이월</span>
                        <span className="tabular-nums">{fmt(mg.previous_balance)}</span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">MG차감</span>
                        <span className="tabular-nums text-red-600">
                          {mg.mg_deducted > 0 ? `-${mg.mg_deducted.toLocaleString()}` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">MG잔액</span>
                        <span className={`tabular-nums font-semibold ${mg.current_balance > 0 ? 'text-orange-600' : ''}`}>
                          {fmt(mg.current_balance)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="border-t-2 pt-3 px-1 flex justify-between font-semibold text-sm">
                <span>합계 ({filtered.length}건)</span>
                <span className="tabular-nums text-orange-600">{totals.current_balance.toLocaleString()}</span>
              </div>
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium w-8">NO</th>
                    {viewMode === 'work' ? (
                      <>
                        <th className="py-2 px-3 font-medium">작품명</th>
                        <th className="py-2 px-3 font-medium">파트너명</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2 px-3 font-medium">파트너명</th>
                        <th className="py-2 px-3 font-medium">거래처명</th>
                        <th className="py-2 px-3 font-medium">소득구분</th>
                        <th className="py-2 px-3 font-medium">작품명</th>
                      </>
                    )}
                    <th className="py-2 px-3 font-medium text-right">전월이월</th>
                    <th className="py-2 px-3 font-medium text-right">당월 MG 추가</th>
                    <th className="py-2 px-3 font-medium text-right">당월 MG 차감</th>
                    <th className="py-2 px-3 font-medium text-right">MG잔액</th>
                    <th className="py-2 px-3 font-medium">MG 조건</th>
                    <th className="py-2 px-3 font-medium">월별 메모</th>
                    <th className="py-2 px-3 font-medium w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((mg, i) => {
                    const condition = getWpNote(mg.partner_id, mg);
                    return (
                      <tr key={mg.id} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                        {viewMode === 'work' ? (
                          <>
                            <td className="py-2 px-3 font-medium">
                              {(() => {
                                const poolWorkIds = getPoolWorkIds(mg);
                                const firstWorkId = poolWorkIds[0] || mg.work_id;
                                return (
                                  <Link
                                    href={`/accounting/settlement/works/${firstWorkId}`}
                                    className="text-primary hover:underline"
                                  >
                                    {mg.work?.name || '-'}
                                  </Link>
                                );
                              })()}
                            </td>
                            <td className="py-2 px-3">
                              <Link
                                href={`/accounting/settlement/partners/${mg.partner_id}`}
                                className="text-primary hover:underline"
                              >
                                {mg.partner?.name || '-'}
                              </Link>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 px-3 font-medium">
                              <Link
                                href={`/accounting/settlement/partners/${mg.partner_id}`}
                                className="text-primary hover:underline"
                              >
                                {mg.partner?.name || '-'}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{mg.partner?.company_name || '-'}</td>
                            <td className="py-2 px-3">
                              <Badge variant="secondary" className="text-xs">
                                {PARTNER_TYPE_LABELS[mg.partner?.partner_type || ''] || '-'}
                              </Badge>
                            </td>
                            <td className="py-2 px-3">{mg.work?.name || '-'}</td>
                          </>
                        )}
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(mg.previous_balance)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-blue-600">
                          {mg.mg_added !== 0 ? (mg.mg_added > 0 ? `+${mg.mg_added.toLocaleString()}` : mg.mg_added.toLocaleString()) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-600">
                          {mg.mg_deducted > 0 ? `-${mg.mg_deducted.toLocaleString()}` : '-'}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${mg.current_balance > 0 ? 'text-orange-600' : ''}`}>
                          {fmt(mg.current_balance)}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground max-w-[160px] truncate" title={condition}>
                          {condition || ''}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground max-w-[160px] truncate" title={mg.note || ''}>
                          {mg.note || ''}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-0.5">
                            <Link href={`/accounting/settlement/mg/history?partnerId=${mg.partner_id}`}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="MG 히스토리">
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            {canManage && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(mg)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3">합계 ({filtered.length}건)</td>
                    {viewMode === 'partner' && <><td className="py-2 px-3"></td><td className="py-2 px-3"></td></>}
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right tabular-nums">{totals.previous_balance.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-blue-600">
                      {totals.mg_added !== 0 ? (totals.mg_added > 0 ? `+${totals.mg_added.toLocaleString()}` : totals.mg_added.toLocaleString()) : '-'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-red-600">
                      {totals.mg_deducted > 0 ? `-${totals.mg_deducted.toLocaleString()}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-orange-600">{totals.current_balance.toLocaleString()}</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 특이사항 편집 다이얼로그 */}
      <Dialog open={!!editMg} onOpenChange={(open) => { if (!open) setEditMg(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              특이사항 — {editMg?.partner?.name} / {editMg?.work?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">MG 조건 (상시 — 계약 조건, 차감 규칙 등)</Label>
              <Textarea
                value={editCondition}
                onChange={(e) => setEditCondition(e.target.value)}
                rows={3}
                placeholder="예: 연재기간 동안 회당 MG 30만원 추가"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">월별 메모 ({editMg?.month})</Label>
              <Textarea
                value={editMonthNote}
                onChange={(e) => setEditMonthNote(e.target.value)}
                rows={3}
                placeholder="이번 달 특이사항"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditMg(null)}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
