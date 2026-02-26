'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { PartnerForm } from '@/components/settlement/PartnerForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, FileText, Search } from 'lucide-react';
import { RsPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '국내법인',
  foreign_corp: '해외법인',
  naver: '네이버',
};

interface PartnerWithRevenue extends RsPartner {
  total_revenue: number;
  total_revenue_share: number;
  work_count: number;
  mg_balance: number;
}

export default function PartnersPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [partners, setPartners] = useState<PartnerWithRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<RsPartner | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  const load = async () => {
    setLoading(true);
    try {
      const [partnersRes, revenueRes, mgRes] = await Promise.all([
        settlementFetch('/api/accounting/settlement/partners'),
        settlementFetch(`/api/accounting/settlement/partner-revenue?month=${selectedMonth}`),
        settlementFetch(`/api/accounting/settlement/mg?month=${selectedMonth}`),
      ]);
      const partnersData = await partnersRes.json();
      const revenueData = await revenueRes.json();
      const mgData = await mgRes.json();

      const revenueMap = new Map<string, { total_revenue: number; total_revenue_share: number; work_count: number }>();
      for (const pr of revenueData.partner_revenues || []) {
        revenueMap.set(pr.partner_id, {
          total_revenue: pr.total_revenue,
          total_revenue_share: pr.total_revenue_share,
          work_count: pr.works.length,
        });
      }

      // MG 잔액을 파트너별로 합산
      const mgMap = new Map<string, number>();
      for (const b of mgData.mg_balances || []) {
        const bal = Number(b.current_balance) || 0;
        mgMap.set(b.partner_id, (mgMap.get(b.partner_id) || 0) + bal);
      }

      const merged: PartnerWithRevenue[] = (partnersData.partners || []).map((p: RsPartner) => {
        const rev = revenueMap.get(p.id);
        return {
          ...p,
          total_revenue: rev?.total_revenue || 0,
          total_revenue_share: rev?.total_revenue_share || 0,
          work_count: rev?.work_count || 0,
          mg_balance: mgMap.get(p.id) || 0,
        };
      });

      merged.sort((a, b) => b.total_revenue_share - a.total_revenue_share);
      setPartners(merged);
    } catch (e) {
      console.error('파트너 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile, selectedMonth]);

  const handleCreate = async (data: Partial<RsPartner>) => {
    const res = await settlementFetch('/api/accounting/settlement/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleUpdate = async (data: Partial<RsPartner>) => {
    if (!editPartner) return;
    const res = await settlementFetch(`/api/accounting/settlement/partners/${editPartner.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditPartner(null);
      await load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/partners/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  const filtered = search
    ? partners.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.company_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : partners;

  const grandTotalRevenue = filtered.reduce((s, p) => s + p.total_revenue, 0);
  const grandTotalShare = filtered.reduce((s, p) => s + p.total_revenue_share, 0);
  const grandTotalMg = filtered.reduce((s, p) => s + p.mg_balance, 0);


  return (
    <div className="container mx-auto p-3 md:p-6 space-y-6">
      <SettlementHeader />

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>파트너 ({selectedMonth})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름, 거래처 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-52"
              />
            </div>
            {canManage && (
              <Button onClick={() => { setEditPartner(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                파트너 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : partners.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 파트너가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium">이름</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">거래처</th>
                    <th className="py-2 px-3 font-medium hidden md:table-cell">구분</th>
                    <th className="py-2 px-3 font-medium text-right hidden md:table-cell">작품 수</th>
                    <th className="py-2 px-3 font-medium text-right hidden md:table-cell">총 매출</th>
                    <th className="py-2 px-3 font-medium text-right">수익분배금</th>
                    <th className="py-2 px-3 font-medium text-right hidden md:table-cell">MG 잔액</th>
                    <th className="py-2 px-3 font-medium text-center">정산서</th>
                    {canManage && <th className="py-2 px-3 font-medium hidden md:table-cell"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/accounting/settlement/partners/${p.id}`)}
                    >
                      <td className="py-2 px-3 font-medium">{p.name}</td>
                      <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{p.company_name || '-'}</td>
                      <td className="py-2 px-3 hidden md:table-cell">
                        <Badge variant="secondary">{PARTNER_TYPE_LABELS[p.partner_type] || p.partner_type}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{p.work_count || '-'}</td>
                      <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                        {p.total_revenue > 0 ? p.total_revenue.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">
                        {p.total_revenue_share > 0 ? p.total_revenue_share.toLocaleString() : '-'}
                      </td>
                      <td className={`py-2 px-3 text-right tabular-nums hidden md:table-cell ${p.mg_balance > 0 ? 'text-orange-600 font-medium' : ''}`}>
                        {p.mg_balance > 0 ? p.mg_balance.toLocaleString() : '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {p.total_revenue_share > 0 && (
                          <Link
                            href={`/accounting/settlement/partners/${p.id}/statement`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button variant="outline" size="sm">
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              정산서
                            </Button>
                          </Link>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2 px-3 hidden md:table-cell">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); setEditPartner(p); setFormOpen(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3">합계 ({filtered.length}명{search ? ` / ${partners.length}명` : ''})</td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{grandTotalRevenue.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{grandTotalShare.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{grandTotalMg > 0 ? grandTotalMg.toLocaleString() : '-'}</td>
                    <td className="py-2 px-3"></td>
                    {canManage && <td className="py-2 px-3 hidden md:table-cell"></td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PartnerForm
        partner={editPartner}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editPartner ? handleUpdate : handleCreate}
      />

    </div>
  );
}
