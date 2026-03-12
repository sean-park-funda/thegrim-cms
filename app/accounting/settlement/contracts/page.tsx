'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { RsWorkPartner } from '@/lib/types/settlement';
import { settlementFetch } from '@/lib/settlement/api';
import { ContractEditDialog } from '@/components/settlement/ContractEditDialog';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  individual_employee: '개인(임직원)',
  individual_simple_tax: '개인(간이)',
  domestic_corp: '사업자(국내)',
  foreign_corp: '사업자(해외)',
  naver: '사업자(네이버)',
};

const SETTLEMENT_CYCLE_LABELS: Record<string, string> = {
  monthly: '매월',
  semi_annual: '반기',
};

type SortKey = 'partner' | 'company' | 'type' | 'report' | 'cycle' | 'work' | 'revenue_rate' | 'mg' | 'mg_rate' | 'rs_rate';
type SortDir = 'asc' | 'desc';

export default function ContractsPage() {
  const { profile } = useStore();
  const [contracts, setContracts] = useState<RsWorkPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('partner');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editWp, setEditWp] = useState<RsWorkPartner | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/work-partners');
      const data = await res.json();
      setContracts(data.work_partners || []);
    } catch (e) {
      console.error('계약 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      load();
    }
  }, [profile, load]);

  const canManage = profile ? canManageAccounting(profile.role) : false;

  const handleExport = () => {
    window.open('/api/accounting/settlement/export?type=contracts', '_blank');
  };

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;

  const filtered = contracts.filter(wp => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (wp.partner?.name || '').toLowerCase().includes(q)
      || (wp.partner?.company_name || '').toLowerCase().includes(q)
      || (wp.work?.name || '').toLowerCase().includes(q);
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortValue = (wp: RsWorkPartner, key: SortKey): string | number => {
    switch (key) {
      case 'partner': return wp.partner?.name || '';
      case 'company': return wp.partner?.company_name || '';
      case 'type': return wp.partner?.partner_type || '';
      case 'report': return wp.partner?.report_type || '';
      case 'cycle': return wp.settlement_cycle || 'monthly';
      case 'work': return wp.work?.name || '';
      case 'revenue_rate': return wp.revenue_rate ?? 1;
      case 'mg': return wp.is_mg_applied ? 1 : 0;
      case 'mg_rate': return wp.mg_rs_rate ?? 0;
      case 'rs_rate': return wp.rs_rate ?? 0;
    }
  };

  const sorted = [...filtered].sort((a, b) => {
    const va = getSortValue(a, sortKey);
    const vb = getSortValue(b, sortKey);
    let cmp = 0;
    if (typeof va === 'string' && typeof vb === 'string') {
      cmp = va.localeCompare(vb, 'ko');
    } else {
      cmp = (va as number) - (vb as number);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const SortHeader = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className}`}
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>계약 ({filtered.length}건)</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="대상자, 거래처, 작품 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 w-full md:w-64"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              엑셀
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : contracts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 계약이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left bg-muted/50">
                    <SortHeader k="partner">대상자</SortHeader>
                    <SortHeader k="company">거래처명</SortHeader>
                    <SortHeader k="type">소득구분</SortHeader>
                    <SortHeader k="report">신고구분</SortHeader>
                    <SortHeader k="cycle">정산주기</SortHeader>
                    <SortHeader k="work">작품명</SortHeader>
                    <SortHeader k="revenue_rate" className="text-center">매출액적용율</SortHeader>
                    <SortHeader k="mg" className="text-center">MG적용</SortHeader>
                    <SortHeader k="mg_rate" className="text-right">MG요율</SortHeader>
                    <SortHeader k="rs_rate" className="text-right">RS요율</SortHeader>
                    <th className="py-2 px-2 font-medium">특이사항</th>
                    {canManage && <th className="py-2 px-2 font-medium"></th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(wp => {
                    const revRate = wp.revenue_rate ?? 1;
                    const rateDisplay = revRate === 1 ? '100%' : `${(revRate * 100).toFixed(0)}%`;

                    return (
                      <tr key={wp.id} className="border-b hover:bg-muted/30">
                        <td className="py-1.5 px-2 font-medium whitespace-nowrap">{wp.partner?.name || '-'}</td>
                        <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap max-w-[200px] truncate">{wp.partner?.company_name || '-'}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{PARTNER_TYPE_LABELS[wp.partner?.partner_type || ''] || wp.partner?.partner_type || '-'}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{wp.partner?.report_type || '-'}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{SETTLEMENT_CYCLE_LABELS[wp.settlement_cycle || 'monthly'] || '매월'}</td>
                        <td className="py-1.5 px-2 whitespace-nowrap">{wp.work?.name || '-'}</td>
                        <td className={`py-1.5 px-2 text-center tabular-nums ${revRate !== 1 ? 'font-semibold text-orange-600' : ''}`}>{rateDisplay}</td>
                        <td className="py-1.5 px-2 text-center">{wp.is_mg_applied ? 'O' : 'X'}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{wp.mg_rs_rate != null ? `${(wp.mg_rs_rate * 100).toFixed(1)}%` : ''}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{`${(wp.rs_rate * 100).toFixed(1)}%`}</td>
                        <td className="py-1.5 px-2 max-w-[200px] truncate text-muted-foreground">{wp.note || ''}</td>
                        {canManage && (
                          <td className="py-1.5 px-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => { setEditWp(wp); setDialogOpen(true); }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractEditDialog
        wp={editWp}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </div>
  );
}
