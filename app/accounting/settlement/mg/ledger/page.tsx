'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, BarChart3, BookOpenText } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';

interface MgWork {
  work_id: string;
  work_name: string;
}

interface MgDeduction {
  id: string;
  month: string;
  amount: number;
  note: string | null;
}

interface MgEntry {
  id: string;
  amount: number;
  withheld_tax: boolean;
  contracted_at: string;
  note: string | null;
  works: MgWork[];
  deductions: MgDeduction[];
  total_deducted: number;
  remaining: number;
}

interface MgPartner {
  id: string;
  name: string;
  company_name: string | null;
  partner_type: string;
}

interface MgSummary {
  total_mg: number;
  total_deducted: number;
  remaining: number;
  entry_count: number;
}

// 통장 한 줄
interface LedgerRow {
  date: string;       // YYYY-MM or YYYY-MM-DD
  sortKey: string;    // for ordering
  deposit: number;    // MG 지급 (입금)
  withdrawal: number; // MG 차감 (출금)
  balance: number;
  note: string;
}

const fmt = (n: number) => n.toLocaleString();

export default function MgLedgerPage() {
  const { profile } = useStore();

  const [partners, setPartners] = useState<MgPartner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [entries, setEntries] = useState<MgEntry[]>([]);
  const [summary, setSummary] = useState<MgSummary | null>(null);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Load partner list
  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    setLoadingPartners(true);
    settlementFetch('/api/accounting/settlement/mg-entries')
      .then(res => res.json())
      .then(data => {
        setPartners(data.partners || []);
        if (data.partners?.length > 0 && !selectedPartnerId) {
          setSelectedPartnerId(data.partners[0].id);
        }
      })
      .catch(err => console.error('Partner list error:', err))
      .finally(() => setLoadingPartners(false));
  }, [profile]);

  // Load entries for selected partner
  useEffect(() => {
    if (!selectedPartnerId) return;
    setLoadingEntries(true);
    settlementFetch(`/api/accounting/settlement/mg-entries?partnerId=${selectedPartnerId}`)
      .then(res => res.json())
      .then(data => {
        setEntries(data.entries || []);
        setSummary(data.summary);
      })
      .catch(err => console.error('MG entries error:', err))
      .finally(() => setLoadingEntries(false));
  }, [selectedPartnerId]);

  // Build bankbook-style rows
  const ledgerRows = useMemo(() => {
    const rows: Omit<LedgerRow, 'balance'>[] = [];

    for (const entry of entries) {
      // MG 지급 행
      const workNames = entry.works.map(w => w.work_name).join(', ');
      const taxLabel = entry.withheld_tax ? '원천징수' : '';
      const parts = [workNames, taxLabel, entry.note].filter(Boolean);
      rows.push({
        date: entry.contracted_at,
        sortKey: entry.contracted_at + '-0', // deposits sort before same-month deductions
        deposit: entry.amount,
        withdrawal: 0,
        note: parts.join(' / '),
      });

      // 차감 행들
      for (const d of entry.deductions) {
        rows.push({
          date: d.month,
          sortKey: d.month + '-1',
          deposit: 0,
          withdrawal: d.amount,
          note: d.note || '',
        });
      }
    }

    // Sort chronologically
    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Calculate running balance
    let balance = 0;
    return rows.map(r => {
      balance += r.deposit - r.withdrawal;
      return { ...r, balance };
    });
  }, [entries]);

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;

  const filteredPartners = search
    ? partners.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.company_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : partners;

  const selectedPartner = partners.find(p => p.id === selectedPartnerId);

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex items-center gap-2">
        <Link href="/accounting/settlement/mg">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            집계
          </Button>
        </Link>
        <Button variant="default" size="sm" className="gap-1.5">
          <BookOpenText className="h-4 w-4" />
          원장
        </Button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)]">
        {/* Left: Partner list */}
        <div className="w-48 shrink-0 flex flex-col border rounded-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingPartners ? (
              <div className="p-4 text-sm text-muted-foreground text-center">로딩 중...</div>
            ) : (
              filteredPartners.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPartnerId(p.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-muted/50 transition-colors ${
                    p.id === selectedPartnerId ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <div>{p.name}</div>
                  {p.company_name && (
                    <div className="text-xs text-muted-foreground truncate">{p.company_name}</div>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t text-xs text-muted-foreground text-center">
            {filteredPartners.length}명
          </div>
        </div>

        {/* Right: Bankbook-style ledger */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPartnerId ? (
            <div className="text-sm text-muted-foreground py-8 text-center">좌측에서 작가를 선택하세요.</div>
          ) : loadingEntries ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">MG 데이터가 없습니다.</div>
          ) : (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-lg font-semibold">
                  {selectedPartner?.name} 원장
                  {selectedPartner?.company_name && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {selectedPartner.company_name}
                    </span>
                  )}
                </h2>
                {summary && (
                  <span className={`text-lg font-bold tabular-nums ${summary.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    잔액 {fmt(summary.remaining)}원
                  </span>
                )}
              </div>

              {/* Ledger table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/60 text-sm border-b">
                      <th className="py-2.5 px-4 text-left font-semibold w-28">월</th>
                      <th className="py-2.5 px-4 text-right font-semibold w-36">MG 지급</th>
                      <th className="py-2.5 px-4 text-right font-semibold w-36">차감</th>
                      <th className="py-2.5 px-4 text-right font-semibold w-36">잔액</th>
                      <th className="py-2.5 px-4 text-left font-semibold">비고</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {ledgerRows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-t hover:bg-muted/30 ${row.deposit > 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                      >
                        <td className="py-2 px-4 tabular-nums">{row.date}</td>
                        <td className="py-2 px-4 text-right tabular-nums text-blue-600 font-medium">
                          {row.deposit > 0 ? fmt(row.deposit) : ''}
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums text-red-600">
                          {row.withdrawal > 0 ? fmt(row.withdrawal) : ''}
                        </td>
                        <td className={`py-2 px-4 text-right tabular-nums font-medium ${row.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {fmt(row.balance)}
                        </td>
                        <td className="py-2 px-4 text-muted-foreground truncate max-w-[300px]" title={row.note}>
                          {row.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {summary && (
                    <tfoot>
                      <tr className="border-t-2 bg-muted/40 font-semibold text-sm">
                        <td className="py-2.5 px-4">합계</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-blue-600">{fmt(summary.total_mg)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-red-600">{fmt(summary.total_deducted)}</td>
                        <td className={`py-2.5 px-4 text-right tabular-nums ${summary.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {fmt(summary.remaining)}
                        </td>
                        <td className="py-2.5 px-4"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
