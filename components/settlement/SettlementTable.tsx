'use client';

import { RsSettlement } from '@/lib/types/settlement';
import { Badge } from '@/components/ui/badge';

interface SettlementTableProps {
  settlements: RsSettlement[];
  loading?: boolean;
  onSelect?: (settlement: RsSettlement) => void;
}

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: '임시', variant: 'secondary' },
  confirmed: { label: '확정', variant: 'default' },
  paid: { label: '지급완료', variant: 'outline' },
};

export function SettlementTable({ settlements, loading, onSelect }: SettlementTableProps) {
  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>;
  }

  if (settlements.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">정산 데이터가 없습니다.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-3 font-medium">파트너</th>
            <th className="py-2 px-3 font-medium">작품</th>
            <th className="py-2 px-3 font-medium text-right hidden md:table-cell">총매출</th>
            <th className="py-2 px-3 font-medium text-right hidden md:table-cell">RS비율</th>
            <th className="py-2 px-3 font-medium text-right hidden md:table-cell">수익배분</th>
            <th className="py-2 px-3 font-medium text-right hidden md:table-cell">세액</th>
            <th className="py-2 px-3 font-medium text-right hidden md:table-cell">MG차감</th>
            <th className="py-2 px-3 font-medium text-right">최종지급</th>
            <th className="py-2 px-3 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {settlements.map((s) => {
            const statusInfo = STATUS_LABELS[s.status] || STATUS_LABELS.draft;
            return (
              <tr
                key={s.id}
                className="border-b hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelect?.(s)}
              >
                <td className="py-2 px-3">{s.partner?.name || s.partner_id}</td>
                <td className="py-2 px-3">{s.work?.name || s.work_id}</td>
                <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{Number(s.gross_revenue).toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{(Number(s.rs_rate) * 100).toFixed(1)}%</td>
                <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{Number(s.revenue_share).toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{Number(s.tax_amount).toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{Number(s.mg_deduction).toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold">{Number(s.final_payment).toLocaleString()}</td>
                <td className="py-2 px-3">
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2 px-3" colSpan={2}>합계</td>
            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{settlements.reduce((s, r) => s + Number(r.gross_revenue), 0).toLocaleString()}</td>
            <td className="py-2 px-3 hidden md:table-cell"></td>
            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{settlements.reduce((s, r) => s + Number(r.revenue_share), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{settlements.reduce((s, r) => s + Number(r.tax_amount), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums hidden md:table-cell">{settlements.reduce((s, r) => s + Number(r.mg_deduction), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{settlements.reduce((s, r) => s + Number(r.final_payment), 0).toLocaleString()}</td>
            <td className="py-2 px-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
