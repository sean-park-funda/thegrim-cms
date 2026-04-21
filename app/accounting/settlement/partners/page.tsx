'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { PartnerForm } from '@/components/settlement/PartnerForm';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, FileText, Search, Menu } from 'lucide-react';
import { RsPartner, PartnerType, ReportType } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { useSidebar } from '@/components/ui/sidebar';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  individual_employee: '개인-임직원',
  individual_simple_tax: '개인-간이',
  domestic_corp: '국내법인',
  foreign_corp: '해외법인',
  naver: '네이버',
};

const PARTNER_TYPE_TAX: Record<PartnerType, number> = {
  individual: 0.033,
  individual_employee: 0.033,
  individual_simple_tax: 0.033,
  domestic_corp: 0,
  foreign_corp: 0.22,
  naver: 0,
};

const DEFAULT_REPORT_TYPE: Record<PartnerType, ReportType> = {
  individual: '기타소득',
  individual_employee: '기타소득',
  individual_simple_tax: '사업소득',
  domestic_corp: '세금계산서',
  foreign_corp: '기타소득',
  naver: '세금계산서',
};

interface PartnerWithRevenue extends RsPartner {
  total_revenue: number;
  total_revenue_share: number;
  work_count: number;
  mg_balance: number;
  has_semi_annual: boolean;
}

export default function PartnersPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const { toggleSidebar } = useSidebar();
  const [partners, setPartners] = useState<PartnerWithRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editPartner, setEditPartner] = useState<RsPartner | null>(null);
  const [search, setSearch] = useState('');

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

      const revenueMap = new Map<string, { total_revenue: number; total_revenue_share: number; work_count: number; has_semi_annual: boolean }>();
      for (const pr of revenueData.partner_revenues || []) {
        revenueMap.set(pr.partner_id, {
          total_revenue: pr.total_revenue,
          total_revenue_share: pr.total_revenue_share,
          work_count: pr.works.length,
          has_semi_annual: pr.has_semi_annual || false,
        });
      }

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
          has_semi_annual: rev?.has_semi_annual || false,
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

  const handleTypeChange = async (partnerId: string, newType: PartnerType) => {
    const res = await settlementFetch(`/api/accounting/settlement/partners/${partnerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_type: newType,
        tax_rate: PARTNER_TYPE_TAX[newType],
        report_type: DEFAULT_REPORT_TYPE[newType],
        salary_deduction: newType === 'individual_employee' ? undefined : 0,
      }),
    });
    if (res.ok) await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const res = await settlementFetch(`/api/accounting/settlement/partners/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">파트너</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedMonth} 파트너별 매출/정산 현황</p>
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            placeholder="이름, 거래처 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered.length === 1) {
                router.push(`/accounting/settlement/partners/${filtered[0].id}`);
              }
            }}
            className="w-full pl-9 pr-3 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
          />
        </div>
        {canManage && (
          <button
            onClick={() => { setEditPartner(null); setFormOpen(true); }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-sm font-medium text-white hover:shadow-lg hover:shadow-cyan-500/25 transition-all flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">파트너 추가</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="text-sm text-zinc-400 py-16 text-center">로딩 중...</div>
        ) : partners.length === 0 ? (
          <div className="text-sm text-zinc-400 py-16 text-center">등록된 파트너가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left">
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400">이름</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell">거래처</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell">구분</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-right hidden md:table-cell">작품 수</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-right hidden md:table-cell">총 매출</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-right">수익분배금</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-right hidden md:table-cell">MG 잔액</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-center">정산서</th>
                  {canManage && <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/accounting/settlement/partners/${p.id}`)}
                  >
                    <td className="py-3 px-4 font-medium">
                      <span className="flex items-center gap-1.5">
                        {p.name}
                        {p.has_semi_annual && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-pink-400 text-pink-600">반기</Badge>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 hidden md:table-cell">{p.company_name || '-'}</td>
                    <td className="py-3 px-4 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                      {canManage ? (
                        <Select
                          value={p.partner_type}
                          onValueChange={(v) => handleTypeChange(p.id, v as PartnerType)}
                        >
                          <SelectTrigger className="h-7 w-[110px] text-xs rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PARTNER_TYPE_LABELS).map(([key, label]) => (
                              <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          {PARTNER_TYPE_LABELS[p.partner_type] || p.partner_type}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-zinc-500 hidden md:table-cell">{p.work_count || '-'}</td>
                    <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">
                      {p.total_revenue > 0 ? p.total_revenue.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold">
                      {p.total_revenue_share > 0 ? p.total_revenue_share.toLocaleString() : '-'}
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums hidden md:table-cell ${p.mg_balance > 0 ? 'text-orange-500 font-medium' : 'text-zinc-400'}`}>
                      {p.mg_balance > 0 ? p.mg_balance.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.total_revenue_share > 0 && (
                        <Link
                          href={`/accounting/settlement/partners/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          상세
                        </Link>
                      )}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 hidden md:table-cell">
                        <div className="flex gap-0.5">
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditPartner(p); setFormOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="h-7 w-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-semibold bg-zinc-50/50 dark:bg-zinc-800/30">
                  <td className="py-3 px-4">합계 ({filtered.length}명{search ? ` / ${partners.length}명` : ''})</td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{grandTotalRevenue.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{grandTotalShare.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{grandTotalMg > 0 ? grandTotalMg.toLocaleString() : '-'}</td>
                  <td className="py-3 px-4"></td>
                  {canManage && <td className="py-3 px-4 hidden md:table-cell"></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <PartnerForm
        partner={editPartner}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editPartner ? handleUpdate : handleCreate}
      />
    </div>
  );
}
