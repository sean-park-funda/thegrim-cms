'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting, canManageAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { RsRevenueLine, RevenueType } from '@/lib/types/settlement';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, ChevronDown, ChevronRight, Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';

const REVENUE_TYPE_LABELS: Record<string, string> = {
  domestic_paid: '국내유료',
  global_paid: '글로벌유료',
  domestic_ad: '국내광고',
  global_ad: '글로벌광고',
  secondary: '2차사업',
};

const fmt = (n: number) => Math.round(n).toLocaleString();

type EditField = 'adjustment_supply' | 'adjustment_vat';

interface WorkGroup {
  work_id: string;
  work_name: string;
  lines: RsRevenueLine[];
  totalPayment: number;
  totalSupply: number;
  totalVat: number;
  totalAdjSupply: number;
  totalAdjVat: number;
}

export default function RevenueOriginalDataPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const { toggleSidebar } = useSidebar();
  const [allLines, setAllLines] = useState<RsRevenueLine[]>([]);
  const [workNames, setWorkNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<EditField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = profile && canManageAccounting(profile.role);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;
    loadData();
  }, [profile, selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 작품 목록 (이름 매핑용)
      const worksRes = await settlementFetch('/api/accounting/settlement/works');
      const worksData = await worksRes.json();
      const nameMap = new Map<string, string>();
      for (const w of worksData.works || []) {
        nameMap.set(w.id, w.name);
      }
      setWorkNames(nameMap);

      // 해당 월의 모든 revenue_lines를 한번에 조회
      const linesRes = await settlementFetch(`/api/accounting/settlement/revenue-lines?month=${selectedMonth}`);
      const linesData = await linesRes.json();
      setAllLines(linesData.lines || []);
    } catch (e) {
      console.error('데이터 원본 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (lineId: string) => {
    if (!editingField) return;
    setSaving(true);
    try {
      const res = await settlementFetch('/api/accounting/settlement/revenue-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lineId, [editingField]: Number(editValue) || 0 }),
      });
      if (res.ok) {
        setEditingId(null);
        setEditingField(null);
        await loadData();
      }
    } catch (e) {
      console.error('조정 저장 오류:', e);
    } finally {
      setSaving(false);
    }
  };

  // 작품별 그룹핑
  const workGroups: WorkGroup[] = useMemo(() => {
    const filtered = typeFilter === 'all'
      ? allLines
      : allLines.filter(l => l.revenue_type === typeFilter);

    const map = new Map<string, RsRevenueLine[]>();
    for (const line of filtered) {
      const list = map.get(line.work_id) || [];
      list.push(line);
      map.set(line.work_id, list);
    }

    const groups: WorkGroup[] = [];
    for (const [work_id, lines] of map) {
      const work_name = workNames.get(work_id) || work_id;
      groups.push({
        work_id,
        work_name,
        lines,
        totalPayment: lines.reduce((s, l) => s + Number(l.payment_krw), 0),
        totalSupply: lines.reduce((s, l) => s + Number(l.supply_amount), 0),
        totalVat: lines.reduce((s, l) => s + Number(l.vat_amount), 0),
        totalAdjSupply: lines.reduce((s, l) => s + Number(l.adjustment_supply), 0),
        totalAdjVat: lines.reduce((s, l) => s + Number(l.adjustment_vat), 0),
      });
    }

    return groups
      .filter(g => !search || g.work_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.totalPayment - a.totalPayment);
  }, [allLines, workNames, search, typeFilter]);

  // 전체 합계
  const grandTotals = useMemo(() => {
    let payment = 0, supply = 0, vat = 0, adjS = 0, adjV = 0;
    for (const g of workGroups) {
      payment += g.totalPayment;
      supply += g.totalSupply;
      vat += g.totalVat;
      adjS += g.totalAdjSupply;
      adjV += g.totalAdjVat;
    }
    return { payment, supply, vat, adjS, adjV };
  }, [workGroups]);

  // 수익유형별 존재 여부
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const l of allLines) types.add(l.revenue_type);
    return Array.from(types);
  }, [allLines]);

  const renderAdjCell = (line: RsRevenueLine, field: EditField, value: number) => {
    const isEditing = editingId === line.id && editingField === field;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1 justify-end">
          <Input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-20 h-6 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave(line.id);
              if (e.key === 'Escape') { setEditingId(null); setEditingField(null); }
            }}
            autoFocus
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSave(line.id)} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
        </div>
      );
    }
    return (
      <span
        className={`tabular-nums ${canManage ? 'cursor-pointer hover:text-primary hover:underline' : ''} ${value !== 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}
        onClick={() => {
          if (!canManage) return;
          setEditingId(line.id);
          setEditingField(field);
          setEditValue(String(value));
        }}
      >
        {value !== 0 ? fmt(value) : '-'}
      </span>
    );
  };

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">매출 상세 (데이터 원본)</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{selectedMonth} — 엑셀 원본 행 데이터 · 플랫폼별 공급가/부가세</p>
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="작품 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 h-8 text-sm"
        />
        <div className="flex gap-1.5">
          <Badge
            variant={typeFilter === 'all' ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setTypeFilter('all')}
          >
            전체
          </Badge>
          {availableTypes.map(t => (
            <Badge
              key={t}
              variant={typeFilter === t ? 'default' : 'outline'}
              className="cursor-pointer text-xs"
              onClick={() => setTypeFilter(t)}
            >
              {REVENUE_TYPE_LABELS[t] || t}
            </Badge>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {workGroups.length}개 작품 · {workGroups.reduce((s, g) => s + g.lines.length, 0)}행
        </span>
      </div>

      {/* 전체 요약 */}
      {!loading && workGroups.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Payment(VAT포함)', value: grandTotals.payment },
            { label: '공급가액', value: grandTotals.supply },
            { label: '부가세', value: grandTotals.vat },
            { label: '확정 공급가', value: grandTotals.supply + grandTotals.adjS, highlight: grandTotals.adjS !== 0 },
            { label: '확정 부가세', value: grandTotals.vat + grandTotals.adjV, highlight: grandTotals.adjV !== 0 },
          ].map(item => (
            <div key={item.label} className="rounded-xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-3">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className={`text-lg font-semibold tabular-nums ${item.highlight ? 'text-amber-600' : ''}`}>
                {fmt(item.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 작품별 아코디언 */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">로딩 중...</div>
      ) : workGroups.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          상세 행 데이터가 없습니다.
          <br />
          <span className="text-xs">매출 엑셀을 업로드하면 자동 생성됩니다.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {workGroups.map((group) => {
            const isExpanded = expandedWorkId === group.work_id;
            const finalSupply = group.totalSupply + group.totalAdjSupply;
            const finalVat = group.totalVat + group.totalAdjVat;

            // 플랫폼별 그룹핑
            const platformMap = new Map<string, RsRevenueLine[]>();
            for (const l of group.lines) {
              const key = l.service_platform || '기타';
              const list = platformMap.get(key) || [];
              list.push(l);
              platformMap.set(key, list);
            }
            const platforms = Array.from(platformMap.entries()).sort((a, b) => {
              const sumA = a[1].reduce((s, l) => s + Number(l.supply_amount), 0);
              const sumB = b[1].reduce((s, l) => s + Number(l.supply_amount), 0);
              return sumB - sumA;
            });

            return (
              <div key={group.work_id} className="rounded-xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
                {/* 작품 헤더 */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setExpandedWorkId(isExpanded ? null : group.work_id)}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <Link
                    href={`/accounting/settlement/works/${group.work_id}`}
                    className="font-medium text-sm hover:text-primary truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {group.work_name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{group.lines.length}행</span>
                  <div className="ml-auto flex items-center gap-4 text-xs tabular-nums">
                    <span className="hidden sm:inline text-muted-foreground">Payment {fmt(group.totalPayment)}</span>
                    <span>공급가 <span className="font-semibold">{fmt(finalSupply)}</span></span>
                    <span>VAT <span className="font-semibold">{fmt(finalVat)}</span></span>
                    {(group.totalAdjSupply !== 0 || group.totalAdjVat !== 0) && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">조정</Badge>
                    )}
                  </div>
                </button>

                {/* 펼침 내용: 플랫폼별 테이블 */}
                {isExpanded && (
                  <div className="border-t">
                    {platforms.map(([platform, platformLines]) => {
                      const pFinS = platformLines.reduce((s, l) => s + Number(l.supply_amount) + Number(l.adjustment_supply), 0);
                      const pFinV = platformLines.reduce((s, l) => s + Number(l.vat_amount) + Number(l.adjustment_vat), 0);
                      return (
                        <div key={platform}>
                          <div className="bg-muted/40 px-4 py-1.5 flex items-center justify-between border-b">
                            <span className="text-xs font-medium">{platform}</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground">
                              공급가 {fmt(pFinS)} / VAT {fmt(pFinV)}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b text-left bg-muted/10">
                                  <th className="py-1 px-2 font-medium">국가</th>
                                  <th className="py-1 px-2 font-medium">통화</th>
                                  <th className="py-1 px-2 font-medium text-right">Payment</th>
                                  <th className="py-1 px-2 font-medium text-right">공급가액</th>
                                  <th className="py-1 px-2 font-medium text-right">부가세</th>
                                  <th className="py-1 px-2 font-medium text-right text-amber-600">조정(공급가)</th>
                                  <th className="py-1 px-2 font-medium text-right text-amber-600">조정(VAT)</th>
                                  <th className="py-1 px-2 font-medium text-right">확정 공급가</th>
                                  <th className="py-1 px-2 font-medium text-right">확정 VAT</th>
                                </tr>
                              </thead>
                              <tbody>
                                {platformLines.map((line) => {
                                  const adjS = Number(line.adjustment_supply);
                                  const adjV = Number(line.adjustment_vat);
                                  return (
                                    <tr key={line.id} className="border-b hover:bg-muted/30">
                                      <td className="py-1 px-2">{line.country || '-'}</td>
                                      <td className="py-1 px-2">{line.sale_currency || '-'}</td>
                                      <td className="py-1 px-2 text-right tabular-nums">{fmt(Number(line.payment_krw))}</td>
                                      <td className="py-1 px-2 text-right tabular-nums">{fmt(Number(line.supply_amount))}</td>
                                      <td className="py-1 px-2 text-right tabular-nums">{fmt(Number(line.vat_amount))}</td>
                                      <td className="py-1 px-2 text-right">{renderAdjCell(line, 'adjustment_supply', adjS)}</td>
                                      <td className="py-1 px-2 text-right">{renderAdjCell(line, 'adjustment_vat', adjV)}</td>
                                      <td className="py-1 px-2 text-right tabular-nums font-medium">{fmt(Number(line.supply_amount) + adjS)}</td>
                                      <td className="py-1 px-2 text-right tabular-nums font-medium">{fmt(Number(line.vat_amount) + adjV)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
