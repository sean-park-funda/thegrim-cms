'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { settlementFetch } from '@/lib/settlement/api';

interface InsuranceWork {
  name: string;
  serial_start_date: string | null;
  serial_end_date: string | null;
  revenue_share: number;
}

interface InsuranceEntry {
  partner_id: string;
  partner_name: string;
  company_name: string;
  partner_type: string;
  report_type: string | null;
  works: InsuranceWork[];
  total_settlement: number;
  insurance_amount: number;
  is_eligible: boolean;
  reason: string;
}

export default function InsurancePage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [data, setData] = useState<InsuranceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile && !canViewAccounting(profile.role)) {
      router.push('/webtoons');
    }
  }, [profile, router]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;

    async function load() {
      setLoading(true);
      try {
        const res = await settlementFetch(
          `/api/accounting/settlement/insurance-review?month=${selectedMonth}`
        );
        const json = await res.json();
        setData(json.review || []);
      } catch (e) {
        console.error('예고료 검토 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, selectedMonth]);

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const eligible = data.filter(d => d.is_eligible);
  const notEligible = data.filter(d => !d.is_eligible);
  const totalInsurance = eligible.reduce((s, d) => s + d.insurance_amount, 0);

  return (
    <div className="container mx-auto p-3 md:p-6 space-y-6">
      <SettlementHeader />
      <SettlementNav />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>예고료 대상 검토</span>
            <Badge variant="secondary" className="text-sm">
              예고료 합계: {totalInsurance.toLocaleString()}원
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : data.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              해당 월의 개인 파트너 정산 데이터가 없습니다.
            </div>
          ) : (
            <div className="space-y-6">
              {/* 대상자 */}
              {eligible.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-green-700">예고료 대상 ({eligible.length}명)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="py-2 px-3 font-medium">NO</th>
                          <th className="py-2 px-3 font-medium">파트너명</th>
                          <th className="py-2 px-3 font-medium">작품명</th>
                          <th className="py-2 px-3 font-medium">연재기간</th>
                          <th className="py-2 px-3 font-medium text-right">수익정산금</th>
                          <th className="py-2 px-3 font-medium text-right">예고료</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eligible.map((entry, idx) => (
                          <tr key={entry.partner_id} className="border-b">
                            <td className="py-1.5 px-3">{idx + 1}</td>
                            <td className="py-1.5 px-3">{entry.partner_name}</td>
                            <td className="py-1.5 px-3">{entry.works.map(w => w.name).join(', ')}</td>
                            <td className="py-1.5 px-3 text-xs">
                              {entry.works.map(w => {
                                const start = w.serial_start_date || '?';
                                const end = w.serial_end_date || '연재중';
                                return `${start} ~ ${end}`;
                              }).join(', ')}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              {entry.total_settlement.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums font-medium">
                              {entry.insurance_amount.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-semibold">
                          <td colSpan={4} className="py-2 px-3">합계</td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {eligible.reduce((s, e) => s + e.total_settlement, 0).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums">
                            {totalInsurance.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 제외 대상 */}
              {notEligible.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground">제외 대상 ({notEligible.length}명)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left bg-muted/50">
                          <th className="py-2 px-3 font-medium">파트너명</th>
                          <th className="py-2 px-3 font-medium">작품명</th>
                          <th className="py-2 px-3 font-medium text-right">수익정산금</th>
                          <th className="py-2 px-3 font-medium text-right">예고료 (미적용)</th>
                          <th className="py-2 px-3 font-medium">제외 사유</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notEligible.map(entry => (
                          <tr key={entry.partner_id} className="border-b">
                            <td className="py-1.5 px-3 text-muted-foreground">{entry.partner_name}</td>
                            <td className="py-1.5 px-3 text-muted-foreground">{entry.works.map(w => w.name).join(', ')}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                              {entry.total_settlement.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                              {entry.insurance_amount.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3">
                              <Badge variant="outline" className="text-xs">{entry.reason}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
