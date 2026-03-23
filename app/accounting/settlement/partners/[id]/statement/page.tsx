'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { settlementFetch } from '@/lib/settlement/api';

const PARTNER_TYPE_LABELS: Record<string, string> = {
  individual: '개인',
  individual_employee: '개인(임직원)',
  individual_simple_tax: '개인(간이)',
  domestic_corp: '사업자(국내)',
  foreign_corp: '사업자(해외)',
  naver: '네이버',
};

interface WorkDetail {
  revenue_type: string;
  revenue_type_label: string;
  gross_revenue: number;
  base_revenue: number;
  exclusion_amount: number;
  settlement_target: number;
  revenue_share: number;
  team_labor_cost: number;
  self_labor_cost: number;
  net_share: number;
  rs_rate: number;
}

interface WorkStatement {
  work_name: string;
  work_id: string;
  rs_rate: number;
  revenue_rate: number;
  is_mg_applied: boolean;
  revenue_adjustments: { id: string; label: string; amount: number }[];
  revenue_adjustment_total: number;
  revenue_adjustment_rs: number;
  effective_rate: number;
  details: WorkDetail[];
  work_total_revenue: number;
  work_total_base_revenue: number;
  work_total_exclusion: number;
  work_total_settlement_target: number;
  work_total_share: number;
  work_total_team_labor_cost: number;
  work_total_self_labor_cost: number;
  work_total_net_share: number;
  mg_balance: number;
  mg_deduction: number;
  mg_remaining: number;
}

interface TaxBreakdown {
  income_tax: number;
  local_tax: number;
  vat: number;
  total: number;
}

interface StatementData {
  partner: {
    id: string;
    name: string;
    company_name: string | null;
    partner_type: string;
    tax_rate: number;
  };
  month: string;
  works: WorkStatement[];
  grand_total_revenue: number;
  grand_total_base_revenue: number;
  grand_total_exclusion: number;
  grand_total_settlement_target: number;
  grand_total_share: number;
  grand_total_team_labor_cost: number;
  grand_total_self_labor_cost: number;
  grand_total_net_share: number;
  subtotal: number;
  tax_type: string;
  tax_breakdown: TaxBreakdown;
  tax_amount: number;
  insurance: number;
  total_mg_deduction: number;
  adjustments: { id: string; label: string; amount: number }[];
  total_adjustment: number;
  final_payment: number;
  tax_invoice?: { item: string; supply: number; vat: number; total: number }[] | null;
  tax_invoice_total?: number;
}

export default function StatementPage() {
  const params = useParams();
  const partnerId = params.id as string;
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role) || !partnerId) return;

    async function load() {
      setLoading(true);
      try {
        const res = await settlementFetch(
          `/api/accounting/settlement/partners/${partnerId}/statement?month=${selectedMonth}`
        );
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error('정산서 로드 오류:', e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [profile, partnerId, selectedMonth]);

  if (!profile) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }
  if (!canViewAccounting(profile.role)) return null;

  const workNames = data?.works.map(w => w.work_name).join(', ') || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/accounting/settlement/partners">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            파트너 목록
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      ) : !data || !data.partner ? (
        <div className="text-sm text-muted-foreground py-8 text-center">파트너를 찾을 수 없습니다.</div>
      ) : (
        <Card>
          <CardContent className="p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start justify-between border-b pb-6 gap-2">
              <h2 className="text-2xl font-bold tracking-wide">정 산 서</h2>
              <span className="text-sm text-muted-foreground">더그림엔터테인먼트</span>
            </div>

            {/* Partner info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">대 상 : </span>
                <span className="font-medium">
                  {data.partner.name}
                  {data.partner.company_name ? `(${data.partner.company_name})` : ''}
                </span>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground">수익정산월 : </span>
                <span className="font-medium">{data.month}</span>
              </div>
              <div>
                <span className="text-muted-foreground">작품명 : </span>
                <span className="font-medium">{workNames || '-'}</span>
              </div>
              <div className="text-right">
                <Badge variant="secondary">
                  {PARTNER_TYPE_LABELS[data.partner.partner_type] || data.partner.partner_type}
                </Badge>
              </div>
            </div>

            {/* Section 1: 정산상세내역 */}
            {(() => {
              const hasBaseRevenue = data.works.some(w => w.revenue_rate !== 1);
              const hasExclusion = data.grand_total_exclusion > 0;
              const hasTeamLaborCost = data.grand_total_team_labor_cost > 0;
              const hasSelfLaborCost = data.grand_total_self_labor_cost > 0;
              const hasAnyLaborCost = hasTeamLaborCost || hasSelfLaborCost;
              const midCols = (hasBaseRevenue ? 1 : 0) + (hasExclusion ? 1 : 0) + ((hasBaseRevenue || hasExclusion) ? 1 : 0) + (hasAnyLaborCost ? 1 : 0) + (hasTeamLaborCost ? 1 : 0) + (hasSelfLaborCost ? 1 : 0);
              return (
            <div className="space-y-3">
              <h3 className="font-semibold">1. 정산상세내역</h3>
              {data.works.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  해당 월의 수익 데이터가 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="py-2 px-3 font-medium">작품 구분</th>
                        <th className="py-2 px-3 font-medium">수익구분</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">더그림수익</th>
                        {hasBaseRevenue && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">기준매출</th>
                        )}
                        {hasExclusion && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">정산제외금</th>
                        )}
                        {(hasBaseRevenue || hasExclusion) && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">정산대상금</th>
                        )}
                        {hasAnyLaborCost && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">수익배분</th>
                        )}
                        {hasTeamLaborCost && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">팀인건비</th>
                        )}
                        {hasSelfLaborCost && (
                          <th className="py-2 px-3 font-medium text-right hidden md:table-cell">근로소득공제</th>
                        )}
                        <th className="py-2 px-3 font-medium text-right">수익정산</th>
                        <th className="py-2 px-3 font-medium text-right hidden md:table-cell">수익배분율</th>
                        <th className="py-2 px-3 font-medium hidden md:table-cell">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.works.map((work) => (
                        <React.Fragment key={work.work_id}>
                          {work.details
                            .filter(d => d.gross_revenue > 0)
                            .map((d, i) => (
                              <tr key={`${work.work_id}-${d.revenue_type}`} className="border-b">
                                <td className="py-1.5 px-3">{i === 0 ? work.work_name : ''}</td>
                                <td className="py-1.5 px-3">{d.revenue_type_label}</td>
                                <td className="py-1.5 px-3 text-right tabular-nums hidden md:table-cell">
                                  {d.gross_revenue.toLocaleString()}
                                </td>
                                {hasBaseRevenue && (
                                  <td className="py-1.5 px-3 text-right tabular-nums hidden md:table-cell">
                                    {d.base_revenue.toLocaleString()}
                                  </td>
                                )}
                                {hasExclusion && (
                                  <td className="py-1.5 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                                    {d.exclusion_amount > 0 ? `-${d.exclusion_amount.toLocaleString()}` : ''}
                                  </td>
                                )}
                                {(hasBaseRevenue || hasExclusion) && (
                                  <td className="py-1.5 px-3 text-right tabular-nums hidden md:table-cell">
                                    {d.settlement_target.toLocaleString()}
                                  </td>
                                )}
                                {hasAnyLaborCost && (
                                  <td className="py-1.5 px-3 text-right tabular-nums hidden md:table-cell">
                                    {d.revenue_share.toLocaleString()}
                                  </td>
                                )}
                                {hasTeamLaborCost && (
                                  <td className="py-1.5 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                                    {d.team_labor_cost > 0 ? `-${d.team_labor_cost.toLocaleString()}` : ''}
                                  </td>
                                )}
                                {hasSelfLaborCost && (
                                  <td className="py-1.5 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                                    {d.self_labor_cost > 0 ? `-${d.self_labor_cost.toLocaleString()}` : ''}
                                  </td>
                                )}
                                <td className="py-1.5 px-3 text-right tabular-nums">
                                  {hasAnyLaborCost
                                    ? d.net_share.toLocaleString()
                                    : d.revenue_share.toLocaleString()}
                                </td>
                                <td className="py-1.5 px-3 text-right tabular-nums hidden md:table-cell">
                                  {(d.rs_rate * 100).toFixed(1)}%
                                </td>
                                <td className="py-1.5 px-3 text-muted-foreground text-xs hidden md:table-cell">
                                  {work.is_mg_applied ? 'MG차감' : ''}
                                </td>
                              </tr>
                            ))}
                          {/* 작품 매출 조정 → 더그림수익 + 수익정산 */}
                          {work.revenue_adjustments?.map(adj => (
                            <tr key={`revadj-${adj.id}`} className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                              <td className="py-1.5 px-3"></td>
                              <td className="py-1.5 px-3 text-sm text-amber-700 dark:text-amber-400">{adj.label}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums text-amber-700 dark:text-amber-400 hidden md:table-cell">
                                {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                              </td>
                              {midCols > 0 && <td colSpan={midCols} className="hidden md:table-cell"></td>}
                              <td className="py-1.5 px-3 text-right tabular-nums text-amber-700 dark:text-amber-400">
                                {(() => { const rs = Math.round(adj.amount * (work.effective_rate || work.rs_rate)); return (rs >= 0 ? '+' : '') + rs.toLocaleString(); })()}
                              </td>
                              <td className="hidden md:table-cell"></td>
                              <td className="hidden md:table-cell"></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                      {/* 파트너 조정 항목 → 수익정산 컬럼 */}
                      {data.adjustments.map(adj => (
                        <tr key={`adj-${adj.id}`} className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                          <td colSpan={2} className="py-1.5 px-3 text-sm text-muted-foreground">{adj.label}</td>
                          <td className="hidden md:table-cell"></td>
                          {midCols > 0 && <td colSpan={midCols} className="hidden md:table-cell"></td>}
                          <td className={`py-1.5 px-3 text-right tabular-nums ${adj.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                          </td>
                          <td className="hidden md:table-cell"></td>
                          <td className="hidden md:table-cell"></td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-semibold">
                        <td className="py-2 px-3">합계</td>
                        <td className="py-2 px-3"></td>
                        <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                          {data.grand_total_revenue.toLocaleString()}
                        </td>
                        {hasBaseRevenue && (
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                            {data.grand_total_base_revenue.toLocaleString()}
                          </td>
                        )}
                        {hasExclusion && (
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                            -{data.grand_total_exclusion.toLocaleString()}
                          </td>
                        )}
                        {(hasBaseRevenue || hasExclusion) && (
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                            {data.grand_total_settlement_target.toLocaleString()}
                          </td>
                        )}
                        {hasAnyLaborCost && (
                          <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">
                            {data.grand_total_share.toLocaleString()}
                          </td>
                        )}
                        {hasTeamLaborCost && (
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                            -{data.grand_total_team_labor_cost.toLocaleString()}
                          </td>
                        )}
                        {hasSelfLaborCost && (
                          <td className="py-2 px-3 text-right tabular-nums text-red-600 hidden md:table-cell">
                            -{data.grand_total_self_labor_cost.toLocaleString()}
                          </td>
                        )}
                        <td className="py-2 px-3 text-right tabular-nums">
                          {((hasAnyLaborCost
                            ? data.grand_total_net_share
                            : data.grand_total_share) + data.total_adjustment).toLocaleString()}
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell"></td>
                        <td className="py-2 px-3 hidden md:table-cell"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
              );
            })()}

            {/* Section 2: 지급상세내역 */}
            <div className="space-y-3">
              <h3 className="font-semibold">2. 지급상세내역</h3>
              {(data.partner.partner_type === 'domestic_corp' || data.partner.partner_type === 'naver') && data.tax_invoice ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="py-2 px-3 font-medium">품목</th>
                        <th className="py-2 px-3 font-medium text-right">공급가액</th>
                        <th className="py-2 px-3 font-medium text-right">VAT</th>
                        <th className="py-2 px-3 font-medium text-right">합 계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tax_invoice.map((inv, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-1.5 px-3">{inv.item}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{inv.supply.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{inv.vat.toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{inv.total.toLocaleString()}</td>
                        </tr>
                      ))}
                      {data.tax_invoice.length > 1 && (
                        <tr className="border-t-2 font-semibold">
                          <td className="py-2 px-3">세금계산서 합계</td>
                          <td className="py-2 px-3 text-right tabular-nums">{data.tax_invoice.reduce((s, t) => s + t.supply, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{data.tax_invoice.reduce((s, t) => s + t.vat, 0).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{(data.tax_invoice_total || 0).toLocaleString()}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {data.total_mg_deduction > 0 && (
                    <table className="w-full text-sm mt-2">
                      <tbody>
                        <tr className="border-b">
                          <td className="py-1.5 px-3 text-muted-foreground">MG 차감</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-red-600">-{data.total_mg_deduction.toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  <div className="flex justify-between items-center mt-3 pt-2 border-t-2">
                    <span className="font-semibold">지급액</span>
                    <span className="text-lg font-bold tabular-nums">{data.final_payment.toLocaleString()}</span>
                  </div>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left bg-muted/50">
                      <th className="py-2 px-3 font-medium text-right">수익정산금</th>
                      {data.tax_type === 'royalty' ? (
                        <>
                          <th className="py-2 px-3 font-medium text-right">사용료 (10/110)</th>
                          <th className="py-2 px-3 font-medium text-right">주민세 (1/110)</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2 px-3 font-medium text-right">
                            {data.partner.partner_type === 'foreign_corp' ? '소득세 (20%)' : '사업소득세 (3%)'}
                          </th>
                          <th className="py-2 px-3 font-medium text-right">지방세 (10%)</th>
                        </>
                      )}
                      {data.insurance > 0 && (
                        <th className="py-2 px-3 font-medium text-right">예고료</th>
                      )}
                      {data.total_mg_deduction > 0 && (
                        <th className="py-2 px-3 font-medium text-right">MG 차감</th>
                      )}
                      {data.adjustments.map(adj => (
                        <th key={adj.id} className="py-2 px-3 font-medium text-right">{adj.label}</th>
                      ))}
                      <th className="py-2 px-3 font-medium text-right">지급액</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b font-semibold">
                      <td className="py-2 px-3 text-right tabular-nums">
                        {(data.grand_total_team_labor_cost > 0 || data.grand_total_self_labor_cost > 0)
                          ? data.grand_total_net_share.toLocaleString()
                          : data.grand_total_share.toLocaleString()}
                      </td>
                      <>
                        <td className="py-2 px-3 text-right tabular-nums text-red-600">
                          {data.tax_breakdown.income_tax > 0 ? `-${data.tax_breakdown.income_tax.toLocaleString()}` : '0'}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-red-600">
                          {data.tax_breakdown.local_tax > 0 ? `-${data.tax_breakdown.local_tax.toLocaleString()}` : '0'}
                        </td>
                      </>
                      {data.insurance > 0 && (
                        <td className="py-2 px-3 text-right tabular-nums text-red-600">
                          -{data.insurance.toLocaleString()}
                        </td>
                      )}
                      {data.total_mg_deduction > 0 && (
                        <td className="py-2 px-3 text-right tabular-nums text-red-600">
                          -{data.total_mg_deduction.toLocaleString()}
                        </td>
                      )}
                      {data.adjustments.map(adj => (
                        <td key={adj.id} className={`py-2 px-3 text-right tabular-nums ${adj.amount < 0 ? 'text-red-600' : ''}`}>
                          {adj.amount >= 0 ? '+' : ''}{adj.amount.toLocaleString()}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right tabular-nums text-lg">
                        {data.final_payment.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              )}
            </div>

            {/* Section 3: MG 정산 (if any) */}
            {data.works.some(w => w.is_mg_applied && w.mg_balance > 0) && (
              <div className="space-y-3">
                <h3 className="font-semibold">3. MG 정산</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/50">
                        <th className="py-2 px-3 font-medium">작품명</th>
                        <th className="py-2 px-3 font-medium text-right">잔액</th>
                        <th className="py-2 px-3 font-medium text-right">MG 차감</th>
                        <th className="py-2 px-3 font-medium text-right">차감 후 잔액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.works
                        .filter(w => w.is_mg_applied && w.mg_balance > 0)
                        .map(w => (
                          <tr key={w.work_id} className="border-b">
                            <td className="py-1.5 px-3">{w.work_name}</td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              {w.mg_balance.toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums text-red-600">
                              {w.mg_deduction !== 0 ? w.mg_deduction.toLocaleString() : '0'}
                            </td>
                            <td className="py-1.5 px-3 text-right tabular-nums">
                              {w.mg_remaining.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Section: 정산 관련 */}
            <div className="space-y-2 text-sm text-muted-foreground border-t pt-4">
              <h3 className="font-semibold text-foreground">정산 관련</h3>
              <p>- 수익정산 : 면세사업자(동일금액입금) / 과세사업자(VAT 포함 금액) / 사업소득자 3.3% 공제 후 지급</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
