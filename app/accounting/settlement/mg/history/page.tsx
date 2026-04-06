'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
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

export default function MgHistoryPage() {
  const { profile } = useStore();
  const searchParams = useSearchParams();
  const partnerId = searchParams.get('partnerId');

  const [partner, setPartner] = useState<MgPartner | null>(null);
  const [entries, setEntries] = useState<MgEntry[]>([]);
  const [summary, setSummary] = useState<MgSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role) || !partnerId) return;
    setLoading(true);

    settlementFetch(`/api/accounting/settlement/mg-entries?partnerId=${partnerId}`)
      .then(res => res.json())
      .then(data => {
        setPartner(data.partner);
        setEntries(data.entries || []);
        setSummary(data.summary);
        // Auto-expand entries with remaining balance
        const active = new Set<string>();
        for (const e of (data.entries || [])) {
          if (e.remaining > 0) active.add(e.id);
        }
        setExpandedEntries(active);
      })
      .catch(err => console.error('MG history load error:', err))
      .finally(() => setLoading(false));
  }, [profile, partnerId]);

  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;
  if (!partnerId) return <div className="p-6 text-muted-foreground">partnerId가 필요합니다.</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/accounting/settlement/mg">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold">
            {partner?.name || '...'} MG 히스토리
          </h1>
          {partner?.company_name && (
            <p className="text-sm text-muted-foreground">{partner.company_name}</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">MG 데이터가 없습니다.</div>
      ) : (
        <>
          {/* Summary card */}
          {summary && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">총 MG</p>
                    <p className="text-lg font-semibold tabular-nums">{fmt(summary.total_mg)}원</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 차감</p>
                    <p className="text-lg font-semibold tabular-nums text-red-600">-{fmt(summary.total_deducted)}원</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">잔액</p>
                    <p className={`text-lg font-semibold tabular-nums ${summary.remaining > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {fmt(summary.remaining)}원
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">MG 건수</p>
                    <p className="text-lg font-semibold">{summary.entry_count}건</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry list */}
          <div className="space-y-3">
            {entries.map((entry) => {
              const isExpanded = expandedEntries.has(entry.id);
              const exhausted = entry.remaining <= 0;

              return (
                <Card key={entry.id} className={exhausted ? 'opacity-60' : ''}>
                  <CardHeader
                    className="cursor-pointer py-4"
                    onClick={() => toggleEntry(entry.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold tabular-nums">{fmt(entry.amount)}원</span>
                            <Badge variant={entry.withheld_tax ? 'default' : 'outline'} className="text-xs">
                              {entry.withheld_tax ? '원천징수O' : '원천징수X'}
                            </Badge>
                            {exhausted && (
                              <Badge variant="secondary" className="text-xs">소진완료</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                            <span>{entry.contracted_at}</span>
                            {entry.works.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{entry.works.map(w => w.work_name).join(', ')}</span>
                              </>
                            )}
                            {entry.note && (
                              <>
                                <span>·</span>
                                <span className="text-xs">{entry.note}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold tabular-nums ${entry.remaining > 0 ? 'text-orange-600' : ''}`}>
                          {fmt(entry.remaining)}원
                        </p>
                        <p className="text-xs text-muted-foreground">
                          차감 {fmt(entry.total_deducted)}
                        </p>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && entry.deductions.length > 0 && (
                    <CardContent className="pt-0">
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="py-1.5 px-3 text-left font-medium text-xs">월</th>
                              <th className="py-1.5 px-3 text-right font-medium text-xs">차감액</th>
                              <th className="py-1.5 px-3 text-right font-medium text-xs">남은 잔액</th>
                              {entry.deductions.some(d => d.note) && (
                                <th className="py-1.5 px-3 text-left font-medium text-xs">비고</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              let running = entry.amount;
                              return entry.deductions.map((d) => {
                                running -= d.amount;
                                return (
                                  <tr key={d.id} className="border-t">
                                    <td className="py-1.5 px-3 tabular-nums">{d.month}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                                      -{fmt(d.amount)}
                                    </td>
                                    <td className={`py-1.5 px-3 text-right tabular-nums ${running > 0 ? '' : 'text-green-600'}`}>
                                      {fmt(running)}
                                    </td>
                                    {entry.deductions.some(dd => dd.note) && (
                                      <td className="py-1.5 px-3 text-xs text-muted-foreground">{d.note || ''}</td>
                                    )}
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  )}

                  {isExpanded && entry.deductions.length === 0 && (
                    <CardContent className="pt-0">
                      <p className="text-sm text-muted-foreground">차감 내역 없음</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
