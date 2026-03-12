'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { settlementFetch } from '@/lib/settlement/api';

interface InsuranceEntry {
  partner_id: string;
  partner_name: string;
  company_name: string;
  partner_type: string;
  report_type: string | null;
  work_id: string;
  work_name: string;
  serial_start_date: string | null;
  serial_end_date: string | null;
  total_settlement: number;
  insurance_amount: number;
}

export default function InsurancePage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [data, setData] = useState<InsuranceEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  const uniquePartners = new Set(data.map(d => d.partner_id));
  const totalInsurance = data.reduce((s, d, i) => {
    const isFirstOfPartner = data.findIndex(x => x.partner_id === d.partner_id) === i;
    return s + (isFirstOfPartner ? d.insurance_amount : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>예고료 대상 검토 ({uniquePartners.size}명)</span>
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
                  {data.map((entry, idx) => {
                    const isFirstOfPartner = data.findIndex(x => x.partner_id === entry.partner_id) === idx;
                    return (
                      <tr key={`${entry.partner_id}-${entry.work_name}`} className="border-b">
                        <td className="py-1.5 px-3">{idx + 1}</td>
                        <td className="py-1.5 px-3">
                          <Link href={`/accounting/settlement/partners/${entry.partner_id}`} className="text-primary hover:underline">
                            {entry.partner_name}
                          </Link>
                        </td>
                        <td className="py-1.5 px-3">
                          <Link href={`/accounting/settlement/works/${entry.work_id}`} className="text-primary hover:underline">
                            {entry.work_name}
                          </Link>
                        </td>
                        <td className="py-1.5 px-3 text-xs">
                          {entry.serial_start_date || '?'} ~ {entry.serial_end_date || '연재중'}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums">
                          {isFirstOfPartner ? entry.total_settlement.toLocaleString() : ''}
                        </td>
                        <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${entry.insurance_amount === 0 ? 'text-muted-foreground' : ''}`}>
                          {isFirstOfPartner ? entry.insurance_amount.toLocaleString() : ''}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 font-semibold">
                    <td colSpan={4} className="py-2 px-3">합계</td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {data.reduce((s, e, i) => {
                        const isFirst = data.findIndex(x => x.partner_id === e.partner_id) === i;
                        return s + (isFirst ? e.total_settlement : 0);
                      }, 0).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {totalInsurance.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
