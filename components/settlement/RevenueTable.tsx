'use client';

import { RsRevenue } from '@/lib/types/settlement';

interface RevenueTableProps {
  revenues: RsRevenue[];
  loading?: boolean;
}

export function RevenueTable({ revenues, loading }: RevenueTableProps) {
  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>;
  }

  if (revenues.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">수익 데이터가 없습니다.</div>;
  }

  const totalAll = revenues.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-3 font-medium">작품명</th>
            <th className="py-2 px-3 font-medium text-right">국내유료</th>
            <th className="py-2 px-3 font-medium text-right">글로벌유료</th>
            <th className="py-2 px-3 font-medium text-right">국내광고</th>
            <th className="py-2 px-3 font-medium text-right">글로벌광고</th>
            <th className="py-2 px-3 font-medium text-right">2차사업</th>
            <th className="py-2 px-3 font-medium text-right">합계</th>
          </tr>
        </thead>
        <tbody>
          {revenues.map((r) => (
            <tr key={r.id} className="border-b hover:bg-muted/50">
              <td className="py-2 px-3">{r.work?.name || r.work_id}</td>
              <td className="py-2 px-3 text-right tabular-nums">{Number(r.domestic_paid).toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{Number(r.global_paid).toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{Number(r.domestic_ad).toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{Number(r.global_ad).toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums">{Number(r.secondary).toLocaleString()}</td>
              <td className="py-2 px-3 text-right tabular-nums font-semibold">{Number(r.total).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="py-2 px-3">합계</td>
            <td className="py-2 px-3 text-right tabular-nums">{revenues.reduce((s, r) => s + Number(r.domestic_paid), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{revenues.reduce((s, r) => s + Number(r.global_paid), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{revenues.reduce((s, r) => s + Number(r.domestic_ad), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{revenues.reduce((s, r) => s + Number(r.global_ad), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{revenues.reduce((s, r) => s + Number(r.secondary), 0).toLocaleString()}</td>
            <td className="py-2 px-3 text-right tabular-nums">{totalAll.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
