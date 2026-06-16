'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

type Contract = {
  document_id: string;
  title: string | null;
  status: string | null;
  category: string | null;
  classification: string | null;
  sent_at: string | null;
  completed_at: string | null;
  participants: Array<{ type: string; name: string; contact?: string }> | null;
  labels: Array<{ name: string }> | null;
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: '체결완료',
  WAIT_FOR_SIGNING: '서명대기',
  REQUEST_CANCELLED: '요청취소',
  SIGNING_CANCELLED: '서명취소',
  REJECTED: '거절됨',
};

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-700 border-emerald-200',
  WAIT_FOR_SIGNING: 'bg-blue-500/15 text-blue-700 border-blue-200',
  REQUEST_CANCELLED: 'bg-gray-500/15 text-gray-500 border-gray-200',
  SIGNING_CANCELLED: 'bg-gray-500/15 text-gray-500 border-gray-200',
  REJECTED: 'bg-red-500/15 text-red-700 border-red-200',
};

const LIMIT = 50;

export default function ModusignPage() {
  const { profile } = useStore();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        ...(statusFilter && { status: statusFilter }),
        ...(search && { search }),
      });
      const res = await settlementFetch(`/api/accounting/settlement/modusign?${params}`);
      const data = await res.json();
      setContracts(data.contracts || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) load();
  }, [profile, load]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / LIMIT);

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;

  const signerNames = (c: Contract) =>
    (c.participants || [])
      .filter(p => p.type === 'SIGNER' && p.name !== '더그림엔터테인먼트')
      .map(p => p.name)
      .join(', ') || '-';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">전자계약 현황</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              모두싸인 전자계약 전체 목록 · 총 {total.toLocaleString()}건
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* 필터 영역 */}
          <div className="flex flex-wrap gap-2">
            {/* 상태 필터 */}
            <div className="flex gap-1">
              {(['', 'COMPLETED', 'WAIT_FOR_SIGNING', 'REQUEST_CANCELLED', 'SIGNING_CANCELLED', 'REJECTED'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                    statusFilter === s
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-transparent text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {s === '' ? '전체' : STATUS_LABEL[s] || s}
                </button>
              ))}
            </div>

            {/* 검색 */}
            <div className="flex gap-1 ml-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="계약서명 검색..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  className="pl-8 h-7 text-xs w-52"
                />
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={handleSearch}>검색</Button>
            </div>
          </div>

          {/* 테이블 */}
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중...</div>
          ) : contracts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">계약이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="py-2 px-3 font-medium whitespace-nowrap">상태</th>
                    <th className="py-2 px-3 font-medium">계약서명</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">서명자</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">라벨</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">발송일</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">체결일</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.document_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CLASS[c.status || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                          {STATUS_LABEL[c.status || ''] || c.status || '-'}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 max-w-[360px]">
                        <span className="line-clamp-1 font-medium">{c.title || '-'}</span>
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap text-muted-foreground">
                        {signerNames(c)}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {(c.labels || []).map(l => (
                          <span key={l.name} className="inline-flex items-center px-1.5 py-0.5 mr-1 rounded text-[10px] bg-cyan-500/10 text-cyan-700 border border-cyan-200">
                            {l.name}
                          </span>
                        ))}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap tabular-nums text-muted-foreground">
                        {c.sent_at ? c.sent_at.slice(0, 10) : '-'}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap tabular-nums">
                        {c.completed_at ? c.completed_at.slice(0, 10) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total.toLocaleString()}건
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-2">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
