'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { SettlementNav } from '@/components/settlement/SettlementNav';
import { SettlementHeader } from '@/components/settlement/SettlementHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';

interface PartnerWork {
  work_name: string;
  rs_rate: number;
  total: number;
  revenue_share: number;
}

interface PartnerRevenue {
  partner_id: string;
  partner_name: string;
  company_name: string;
  partner_type: string;
  works: PartnerWork[];
  total_revenue: number;
  total_revenue_share: number;
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  domestic_corp: '사업자(국내)',
  foreign_corp: '사업자(해외)',
  naver: '네이버',
};

export default function PartnerRevenuePage() {
  const router = useRouter();
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [data, setData] = useState<PartnerRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
        const res = await settlementFetch(`/api/accounting/settlement/partner-revenue?month=${selectedMonth}`);
        const json = await res.json();
        setData(json.partner_revenues || []);
      } catch (e) {
        console.error('작가별 수익 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, selectedMonth]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  if (!canViewAccounting(profile.role)) return null;

  const grandTotalRevenue = data.reduce((s, p) => s + p.total_revenue, 0);
  const grandTotalShare = data.reduce((s, p) => s + p.total_revenue_share, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <SettlementHeader />
      <SettlementNav />

      <Card>
        <CardHeader>
          <CardTitle>작가별 수익 ({selectedMonth})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
          ) : data.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              해당 월의 수익 데이터가 없거나 작가-작품 연결이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-3 font-medium w-8"></th>
                    <th className="py-2 px-3 font-medium">작가</th>
                    <th className="py-2 px-3 font-medium">거래처</th>
                    <th className="py-2 px-3 font-medium">구분</th>
                    <th className="py-2 px-3 font-medium text-right">작품 수</th>
                    <th className="py-2 px-3 font-medium text-right">총 매출</th>
                    <th className="py-2 px-3 font-medium text-right">수익분배금</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => {
                    const isExpanded = expandedIds.has(p.partner_id);
                    return (
                      <Fragment key={p.partner_id}>
                        <tr
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleExpand(p.partner_id)}
                        >
                          <td className="py-2 px-3">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </td>
                          <td className="py-2 px-3 font-medium">{p.partner_name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{p.company_name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{PARTNER_TYPE_LABELS[p.partner_type] || p.partner_type}</td>
                          <td className="py-2 px-3 text-right">{p.works.length}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{p.total_revenue.toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">{p.total_revenue_share.toLocaleString()}</td>
                        </tr>
                        {isExpanded && p.works.map((w, i) => (
                          <tr key={i} className="bg-muted/30 border-b">
                            <td className="py-1.5 px-3"></td>
                            <td className="py-1.5 px-3 pl-8 text-muted-foreground">{w.work_name}</td>
                            <td className="py-1.5 px-3"></td>
                            <td className="py-1.5 px-3 text-muted-foreground text-xs">RS {(w.rs_rate * 100).toFixed(0)}%</td>
                            <td className="py-1.5 px-3"></td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{w.total.toLocaleString()}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{w.revenue_share.toLocaleString()}</td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3">합계 ({data.length}명)</td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3"></td>
                    <td className="py-2 px-3 text-right tabular-nums">{grandTotalRevenue.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{grandTotalShare.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

