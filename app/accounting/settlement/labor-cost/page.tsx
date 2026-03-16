'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store/useStore';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { useSidebar } from '@/components/ui/sidebar';
import { Menu, Search, Download, Banknote, Users, BookOpen } from 'lucide-react';

interface LaborCostItem {
  id: string;
  month: string;
  person_type: 'staff' | 'partner';
  person_id: string;
  person_name: string;
  deduction_type: '근로소득공제' | '인건비 공제';
  account_type: '임금' | '외주용역비';
  amount: number;
  note: string | null;
  partners: Array<{ id: string; name: string }>;
  works: Array<{ id: string; name: string }>;
}

export default function LaborCostPage() {
  const { profile } = useStore();
  const { selectedMonth } = useSettlementStore();
  const { toggleSidebar } = useSidebar();
  const [items, setItems] = useState<LaborCostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) {
      loadItems();
    }
  }, [profile, selectedMonth]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await settlementFetch(`/api/accounting/settlement/labor-cost-items?month=${selectedMonth}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      console.error('인건비공제 로드 오류:', e);
    } finally {
      setLoading(false);
    }
  };

  if (!profile || !canViewAccounting(profile.role)) {
    return <div className="flex items-center justify-center h-full">Loading...</div>;
  }

  const filtered = items.filter(item => {
    const matchesSearch = !search ||
      item.person_name.toLowerCase().includes(search.toLowerCase()) ||
      item.partners.some(p => p.name.toLowerCase().includes(search.toLowerCase())) ||
      item.works.some(w => w.name.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === 'all' ||
      (filterType === '근로소득공제' && item.deduction_type === '근로소득공제') ||
      (filterType === '인건비 공제' && item.deduction_type === '인건비 공제');
    return matchesSearch && matchesType;
  });

  const totalAmount = filtered.reduce((s, i) => s + i.amount, 0);
  const salaryCount = filtered.filter(i => i.deduction_type === '근로소득공제').length;
  const laborCount = filtered.filter(i => i.deduction_type === '인건비 공제').length;
  const salaryTotal = filtered.filter(i => i.deduction_type === '근로소득공제').reduce((s, i) => s + i.amount, 0);
  const laborTotal = filtered.filter(i => i.deduction_type === '인건비 공제').reduce((s, i) => s + i.amount, 0);

  // Group by deduction_type for summary
  const uniquePartners = new Set(filtered.flatMap(i => i.partners.map(p => p.id)));
  const uniqueWorks = new Set(filtered.flatMap(i => i.works.map(w => w.id)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">인건비공제</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedMonth} 인건비공제 대상자 리스트</p>
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Banknote className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs text-zinc-500">총 인건비</span>
          </div>
          <p className="text-lg font-bold tabular-nums">{totalAmount.toLocaleString()}<span className="text-xs font-normal text-zinc-400 ml-0.5">원</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Users className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs text-zinc-500">대상자</span>
          </div>
          <p className="text-lg font-bold tabular-nums">{uniquePartners.size}<span className="text-xs font-normal text-zinc-400 ml-0.5">명</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs text-zinc-500">공제 작품</span>
          </div>
          <p className="text-lg font-bold tabular-nums">{uniqueWorks.size}<span className="text-xs font-normal text-zinc-400 ml-0.5">개</span></p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Banknote className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs text-zinc-500">공제 건수</span>
          </div>
          <p className="text-lg font-bold tabular-nums">{filtered.length}<span className="text-xs font-normal text-zinc-400 ml-0.5">건</span></p>
        </div>
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium">근로소득공제</span>
            <span className="text-xs text-zinc-400">{salaryCount}건</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">{salaryTotal.toLocaleString()}원</span>
        </div>
        <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium">인건비 공제</span>
            <span className="text-xs text-zinc-400">{laborCount}건</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">{laborTotal.toLocaleString()}원</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            placeholder="공제인원, 대상자, 작품 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
          />
        </div>
        <div className="flex gap-1">
          {['all', '근로소득공제', '인건비 공제'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`h-10 px-3 rounded-xl text-xs font-medium transition-all ${
                filterType === type
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              {type === 'all' ? '전체' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 overflow-hidden">
        {loading ? (
          <div className="text-sm text-zinc-400 py-16 text-center">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-zinc-400 py-16 text-center">데이터가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 text-left">
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400">대상자</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell">공제 항목</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell">계정명</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400">공제인원</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 text-right">인건비 총액</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden lg:table-cell">공제 작품</th>
                  <th className="py-3 px-4 font-medium text-xs text-zinc-500 dark:text-zinc-400 hidden md:table-cell">비고</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {item.partners.map((p) => (
                          <span
                            key={p.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs font-medium"
                          >
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        item.deduction_type === '근로소득공제'
                          ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {item.deduction_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 hidden md:table-cell">
                      <span className={`text-xs ${item.account_type === '외주용역비' ? 'text-orange-500' : ''}`}>
                        {item.account_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium">{item.person_name}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold">
                      {item.amount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {item.works.map((w) => (
                          <span
                            key={w.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs"
                          >
                            {w.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-zinc-400 text-xs hidden md:table-cell">{item.note || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-semibold bg-zinc-50/50 dark:bg-zinc-800/30">
                  <td className="py-3 px-4">합계 ({filtered.length}건)</td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                  <td className="py-3 px-4"></td>
                  <td className="py-3 px-4 text-right tabular-nums">{totalAmount.toLocaleString()}</td>
                  <td className="py-3 px-4 hidden lg:table-cell"></td>
                  <td className="py-3 px-4 hidden md:table-cell"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
