'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

        {/* Right: Ledger - always expanded */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPartnerId ? (
            <div className="text-sm text-muted-foreground py-8 text-center">좌측에서 작가를 선택하세요.</div>
          ) : loadingEntries ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">MG 데이터가 없습니다.</div>
          ) : (
            <div className="space-y-6">
              {/* Summary bar */}
              {summary && (
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-lg font-semibold">
                    {selectedPartner?.name}
                    {selectedPartner?.company_name && (
                      <span className="text-sm font-normal text-muted-foreground ml-2">
                        {selectedPartner.company_name}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <span className="text-muted-foreground mr-2">총 MG</span>
                      <span className="font-semibold tabular-nums">{fmt(summary.total_mg)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground mr-2">총 차감</span>
                      <span className="font-semibold tabular-nums text-red-600">-{fmt(summary.total_deducted)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground mr-2">잔액</span>
                      <span className={`font-semibold tabular-nums ${summary.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                        {fmt(summary.remaining)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Entries - always expanded */}
              {entries.map((entry, idx) => {
                const exhausted = entry.remaining <= 0;

                return (
                  <div key={entry.id} className={exhausted ? 'opacity-50' : ''}>
                    {/* Entry header */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                        <span className="text-lg font-bold tabular-nums">{fmt(entry.amount)}원</span>
                        <Badge variant={entry.withheld_tax ? 'default' : 'outline'} className="text-xs">
                          {entry.withheld_tax ? '원천징수O' : '원천징수X'}
                        </Badge>
                        {exhausted && <Badge variant="secondary" className="text-xs">소진완료</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{entry.contracted_at}</span>
                        {entry.works.length > 0 && (
                          <span>{entry.works.map(w => w.work_name).join(', ')}</span>
                        )}
                        {entry.note && <span className="text-xs">{entry.note}</span>}
                        <span className={`font-semibold tabular-nums ${entry.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          잔액 {fmt(entry.remaining)}
                        </span>
                      </div>
                    </div>

                    {/* Deduction table - always visible */}
                    {entry.deductions.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-muted/50 text-sm">
                              <th className="py-2 px-4 text-left font-medium">월</th>
                              <th className="py-2 px-4 text-right font-medium">차감액</th>
                              <th className="py-2 px-4 text-right font-medium">잔액</th>
                              {entry.deductions.some(d => d.note) && (
                                <th className="py-2 px-4 text-left font-medium">비고</th>
                              )}
                            </tr>
                          </thead>
                          <tbody className="text-sm">
                            {(() => {
                              let running = entry.amount;
                              return entry.deductions.map(d => {
                                running -= d.amount;
                                return (
                                  <tr key={d.id} className="border-t hover:bg-muted/30">
                                    <td className="py-2 px-4 tabular-nums">{d.month}</td>
                                    <td className="py-2 px-4 text-right tabular-nums text-red-600">
                                      -{fmt(d.amount)}
                                    </td>
                                    <td className={`py-2 px-4 text-right tabular-nums font-medium ${running > 0 ? '' : 'text-green-600'}`}>
                                      {fmt(running)}
                                    </td>
                                    {entry.deductions.some(dd => dd.note) && (
                                      <td className="py-2 px-4 text-muted-foreground">{d.note || ''}</td>
                                    )}
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-4 text-sm text-muted-foreground">
                        차감 내역 없음
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
