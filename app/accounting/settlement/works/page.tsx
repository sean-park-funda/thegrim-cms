'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { WorkForm } from '@/components/settlement/WorkForm';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Search, Download, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { RsWork, RsWorkPartner, RsRevenue } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';

const fmt = (n: number) => n > 0 ? n.toLocaleString() : '-';

type SortKey = 'name' | 'partners' | 'domestic_paid' | 'global_paid' | 'domestic_ad' | 'global_ad' | 'secondary' | 'total';
type SortDir = 'asc' | 'desc';

export default function WorksPage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [works, setWorks] = useState<RsWork[]>([]);
  const [workPartners, setWorkPartners] = useState<RsWorkPartner[]>([]);
  const [revenues, setRevenues] = useState<RsRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editWork, setEditWork] = useState<RsWork | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

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

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const canManage = canManageAccounting(profile.role);

  const revenueMap = new Map<string, RsRevenue>();
  for (const r of revenues) {
    revenueMap.set(r.work_id, r);
  }

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
      className={`py-2 px-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
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

  // Sort
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
      default:
        cmp = (Number(revA?.[sortKey]) || 0) - (Number(revB?.[sortKey]) || 0);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totals = filtered.reduce((acc, w) => {
    const rev = revenueMap.get(w.id);
    if (!rev) return acc;
    return {
      domestic_paid: acc.domestic_paid + (rev.domestic_paid || 0),
      global_paid: acc.global_paid + (rev.global_paid || 0),
      domestic_ad: acc.domestic_ad + (rev.domestic_ad || 0),
      global_ad: acc.global_ad + (rev.global_ad || 0),
      secondary: acc.secondary + (rev.secondary || 0),
      total: acc.total + (rev.total || 0),
    };
  }, { domestic_paid: 0, global_paid: 0, domestic_ad: 0, global_ad: 0, secondary: 0, total: 0 });

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-6">
      <SettlementHeader />

      <SettlementNav />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>작품 ({selectedMonth})</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="작품 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-48"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={revenues.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              엑셀 내보내기
            </Button>
            {canManage && (
              <Button onClick={() => { setEditWork(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                작품 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : works.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 작품이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
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
                  {sorted.map((w) => {
                    const rev = revenueMap.get(w.id);
                    const wps = workPartners.filter(wp => wp.work_id === w.id);
                    return (
                      <tr
                        key={w.id}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => router.push(`/accounting/settlement/works/${w.id}`)}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{w.name}</span>
                            {w.naver_name && w.naver_name !== w.name && (
                              <span className="text-xs text-muted-foreground">({w.naver_name})</span>
                            )}
                            {!w.is_active && <Badge variant="outline" className="text-xs">비활성</Badge>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center tabular-nums hidden md:table-cell">{wps.length || '-'}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(rev?.domestic_paid || 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(rev?.global_paid || 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(rev?.domestic_ad || 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(rev?.global_ad || 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(rev?.secondary || 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmt(rev?.total || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3">합계 ({filtered.length}건)</td>
                    <td className="py-2 px-3 hidden md:table-cell"></td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.domestic_paid)}</td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.global_paid)}</td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.domestic_ad)}</td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.global_ad)}</td>
                    <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{fmt(totals.secondary)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(totals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <WorkForm
        work={editWork}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSave={editWork ? handleUpdate : handleCreate}
      />

    </div>
  );
}
