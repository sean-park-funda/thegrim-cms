'use client';

import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useState } from 'react';

interface SummaryRow {
  no: number;
  partner_id: string;
  partner_name: string;
  company_name: string;
  income_type: string;
  report_type: string;
  tax_id: string;
  works_list: string;
  revenue_share: number;
  production_cost: number;
  adjustment: number;
  settlement_amount: number;
  vat: number;
  income_tax: number;
  local_tax: number;
  mg_deduction: number;
  final_payment: number;
}

interface Props {
  data: SummaryRow[];
  loading: boolean;
}

const fmt = (n: number) => n.toLocaleString();

// 음수는 빨간색, 양수는 기본, 0이면 '-'
function fmtSigned(n: number) {
  if (n === 0) return '-';
  return n.toLocaleString();
}

export function SettlementSummaryTable({ data, loading }: Props) {
  const [search, setSearch] = useState('');

  if (loading) return <div className="py-8 text-center text-muted-foreground">로딩 중...</div>;

  const filtered = data.filter(
    (r) =>
      r.partner_name.includes(search) ||
      r.company_name.includes(search) ||
      r.works_list.includes(search)
  );

  const totals = filtered.reduce(
    (acc, r) => ({
      revenue_share: acc.revenue_share + r.revenue_share,
      production_cost: acc.production_cost + r.production_cost,
      adjustment: acc.adjustment + r.adjustment,
      settlement_amount: acc.settlement_amount + r.settlement_amount,
      vat: acc.vat + r.vat,
      income_tax: acc.income_tax + r.income_tax,
      local_tax: acc.local_tax + r.local_tax,
      mg_deduction: acc.mg_deduction + r.mg_deduction,
      final_payment: acc.final_payment + r.final_payment,
    }),
    { revenue_share: 0, production_cost: 0, adjustment: 0, settlement_amount: 0, vat: 0, income_tax: 0, local_tax: 0, mg_deduction: 0, final_payment: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="파트너/작품 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-2 py-2 text-left text-xs">NO</th>
              <th className="px-2 py-2 text-left">대상자</th>
              <th className="px-2 py-2 text-left">거래처명</th>
              <th className="px-2 py-2 text-left">소득구분</th>
              <th className="px-2 py-2 text-left">신고구분</th>
              <th className="px-2 py-2 text-left text-xs">사업자번호</th>
              <th className="px-2 py-2 text-left max-w-[180px]">작품명</th>
              <th className="px-2 py-2 text-right">수익분배금</th>
              <th className="px-2 py-2 text-right">제작비</th>
              <th className="px-2 py-2 text-right">조정</th>
              <th className="px-2 py-2 text-right font-medium">수익정산금</th>
              <th className="px-2 py-2 text-right text-blue-600">부가세</th>
              <th className="px-2 py-2 text-right text-orange-600">소득세</th>
              <th className="px-2 py-2 text-right text-orange-600">지방세</th>
              <th className="px-2 py-2 text-right text-red-600">MG차감</th>
              <th className="px-2 py-2 text-right font-semibold">지급금액</th>
              <th className="px-2 py-2 text-center">정산서</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={17} className="py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.partner_id} className="border-b hover:bg-muted/30">
                  <td className="px-2 py-2 tabular-nums text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{r.partner_name}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-xs">{r.company_name}</td>
                  <td className="px-2 py-2 text-xs">{r.income_type}</td>
                  <td className="px-2 py-2 text-xs">{r.report_type}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{r.tax_id}</td>
                  <td className="px-2 py-2 max-w-[180px] truncate text-xs" title={r.works_list}>
                    {r.works_list}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmt(r.revenue_share)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtSigned(r.production_cost)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtSigned(r.adjustment)}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(r.settlement_amount)}</td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.vat > 0 ? 'text-blue-600' : ''}`}>
                    {fmtSigned(r.vat)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.income_tax < 0 ? 'text-orange-600' : ''}`}>
                    {fmtSigned(r.income_tax)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.local_tax < 0 ? 'text-orange-600' : ''}`}>
                    {fmtSigned(r.local_tax)}
                  </td>
                  <td className={`px-2 py-2 text-right tabular-nums ${r.mg_deduction < 0 ? 'text-red-600' : ''}`}>
                    {fmtSigned(r.mg_deduction)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(r.final_payment)}</td>
                  <td className="px-2 py-2 text-center">
                    <Link
                      href={`/accounting/settlement/partners/${r.partner_id}/statement`}
                      className="text-primary hover:underline text-xs"
                    >
                      보기
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td colSpan={7} className="px-2 py-2">합계 ({filtered.length}건)</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(totals.revenue_share)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtSigned(totals.production_cost)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtSigned(totals.adjustment)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(totals.settlement_amount)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-blue-600">{fmtSigned(totals.vat)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-orange-600">{fmtSigned(totals.income_tax)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-orange-600">{fmtSigned(totals.local_tax)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-red-600">{fmtSigned(totals.mg_deduction)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmt(totals.final_payment)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
