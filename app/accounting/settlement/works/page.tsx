'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { WorkForm } from '@/components/settlement/WorkForm';
import { Plus, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Menu } from 'lucide-react';
import { RsWork, RsWorkPartner, RsRevenue, RevenueType } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { useSidebar } from '@/components/ui/sidebar';

const fmt = (n: number) => n > 0 ? n.toLocaleString() : '-';
const DEFAULT_REVENUE_TYPES: RevenueType[] = ['domestic_paid', 'global_paid', 'domestic_ad', 'global_ad', 'secondary'];

type SortKey = 'name' | 'partners' | 'domestic_paid' | 'global_paid' | 'domestic_ad' | 'global_ad' | 'secondary' | 'total';
type SortDir = 'asc' | 'desc';

export default function WorksPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const { toggleSidebar } = useSidebar();
  const [works, setWorks] = useState<RsWork[]>([]);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editWork, setEditWork] = useState<RsWork | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = async () => {
    setLoading(true);
    try {
      const [workRes, wpRes, revRes] = await Promise.all([
        settlementFetch('/api/accounting/settlement/works?active=false'),
        settlementFetch('/api/accounting/settlement/work-partners'),
        settlementFetch(`/api/accounting/settlement/revenue?month=${selectedMonth}`),
      ]);
      const workData = await workRes.json();
      const wpData = await wpRes.json();
      const revData = await revRes.json();
      setWorks(workData.works || []);
      setWorkPartners(wpData.work_partners || []);
      setRevenues(revData.revenues || []);
    } catch (e) {
      console.error('작품 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile, selectedMonth]);

  const handleCreate = async (data: Partial<RsWork>) => {
    const res = await settlementFetch('/api/accounting/settlement/works', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) await load();
  };

  const handleUpdate = async (data: Partial<RsWork>) => {
    if (!editWork) return;
    const res = await settlementFetch(`/api/accounting/settlement/works/${editWork.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setEditWork(null);
      await load();
    }
  };

  const handleExport = () => {
    window.open(`/api/accounting/settlement/export?month=${selectedMonth}&type=revenue`, '_blank');
  };

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const canManage = canManageAccounting(profile.role);

  const revenueMap = new Map<string, RsRevenue>();
  for (const r of revenues) {
    revenueMap.set(r.work_id, r);
  }

  // 미확정 유형 제외한 확정 금액 반환
  const confirmedVal = (rev: RsRevenue | undefined, key: RevenueType) => {
    if (!rev) return 0;
    if (rev.unconfirmed_types?.includes(key)) return 0;
    return rev[key] || 0;
  };
  const confirmedTotal = (rev: RsRevenue | undefined) => {
    if (!rev) return 0;
    const unc = rev.unconfirmed_types || [];
    let sum = 0;
    for (const k of DEFAULT_REVENUE_TYPES) {
      if (!unc.includes(k)) sum += (rev[k] || 0);
    }
    return sum;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const SortHeader = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`py-3 px-4 font-medium cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors text-xs text-zinc-500 dark:text-zinc-400 ${className}`}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k ? (
          sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );

  const filtered = works.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    const wps = workPartners.filter(wp => wp.work_id === w.id);
    return w.name.toLowerCase().includes(q)
      || (w.naver_name || '').toLowerCase().includes(q)
      || wps.some(wp => (wp.partner?.name || '').toLowerCase().includes(q));
  });

  const sorted = [...filtered].sort((a, b) => {
    const revA = revenueMap.get(a.id);
    const revB = revenueMap.get(b.id);
    let cmp = 0;
    switch (sortKey) {
      case 'name':
        cmp = a.name.localeCompare(b.name, 'ko');
        break;
      case 'partners':
        cmp = workPartners.filter(wp => wp.work_id === a.id).length - workPartners.filter(wp => wp.work_id === b.id).length;
        break;
      case 'total':
        cmp = confirmedTotal(revA) - confirmedTotal(revB);
        break;
      default:
        cmp = confirmedVal(revA, sortKey as RevenueType) - confirmedVal(revB, sortKey as RevenueType);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totals = filtered.reduce((acc, w) => {
    const rev = revenueMap.get(w.id);
    if (!rev) return acc;
    return {
      domestic_paid: acc.domestic_paid + confirmedVal(rev, 'domestic_paid'),
      global_paid: acc.global_paid + confirmedVal(rev, 'global_paid'),
      domestic_ad: acc.domestic_ad + confirmedVal(rev, 'domestic_ad'),
      global_ad: acc.global_ad + confirmedVal(rev, 'global_ad'),
      secondary: acc.secondary + confirmedVal(rev, 'secondary'),
      total: acc.total + confirmedTotal(rev),
    };
  }, { domestic_paid: 0, global_paid: 0, domestic_ad: 0, global_ad: 0, secondary: 0, total: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">작품</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedMonth} 작품별 매출 현황</p>
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
            placeholder="작품명, 파트너명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={revenues.length === 0}
          className="h-10 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">엑셀 내보내기</span>
        </button>
        {canManage && (
          <button
            onClick={() => { setEditWork(null); setFormOpen(true); }}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-sm font-medium text-white hover:shadow-lg hover:shadow-cyan-500/25 transition-all flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">작품 추가</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="text-sm text-zinc-400 py-16 text-center">로딩 중...</div>
        ) : works.length === 0 ? (
          <div className="text-sm text-zinc-400 py-16 text-center">등록된 작품이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left">
                  <SortHeader k="name">작품명</SortHeader>
                  <SortHeader k="partners" className="text-center hidden md:table-cell">파트너</SortHeader>
                  <SortHeader k="domestic_paid" className="text-right hidden md:table-cell">국내유료</SortHeader>
                  <SortHeader k="global_paid" className="text-right hidden md:table-cell">글로벌유료</SortHeader>
                  <SortHeader k="domestic_ad" className="text-right hidden md:table-cell">국내광고</SortHeader>
                  <SortHeader k="global_ad" className="text-right hidden md:table-cell">글로벌광고</SortHeader>
                  <SortHeader k="secondary" className="text-right hidden md:table-cell">2차사업</SortHeader>
                  <SortHeader k="total" className="text-right">합계</SortHeader>
                </tr>
              </thead>
              <tbody>
                {/* 합계 행 (상단 고정) */}
                <tr className="border-b-2 border-zinc-200 dark:border-zinc-700 font-semibold bg-zinc-50/50 dark:bg-zinc-800/30">
                  <td className="py-3 px-4">합계 ({filtered.length}건)</td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(totals.domestic_paid)}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(totals.global_paid)}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(totals.domestic_ad)}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(totals.global_ad)}</td>
                  <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(totals.secondary)}</td>
                  <td className="py-3 px-4 text-right tabular-nums">{fmt(totals.total)}</td>
                </tr>
                {sorted.map((w) => {
                  const rev = revenueMap.get(w.id);
                  const wps = workPartners.filter(wp => wp.work_id === w.id);
                  return (
                    <tr
                      key={w.id}
                      className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/accounting/settlement/works/${w.id}`)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{w.name}</span>
                          {w.project_code && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-500 font-mono">{w.project_code}</span>
                          )}
                          {w.naver_name && w.naver_name !== w.name && (
                            <span className="text-xs text-zinc-400">({w.naver_name})</span>
                          )}
                          {!w.is_active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400">비활성</span>
                          )}
                          {rev?.unconfirmed_types && rev.unconfirmed_types.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-500">미확정 {rev.unconfirmed_types.length}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-zinc-500 hidden md:table-cell">{wps.length || '-'}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(confirmedVal(rev, 'domestic_paid'))}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(confirmedVal(rev, 'global_paid'))}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(confirmedVal(rev, 'domestic_ad'))}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(confirmedVal(rev, 'global_ad'))}</td>
                      <td className="py-3 px-4 text-right tabular-nums hidden md:table-cell">{fmt(confirmedVal(rev, 'secondary'))}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">{fmt(confirmedTotal(rev))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <WorkForm
        work={editWork}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editWork ? handleUpdate : handleCreate}
      />
    </div>
  );
}
