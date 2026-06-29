'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ChevronLeft, ChevronRight, RefreshCw, FileText, Loader2, Check, Pencil } from 'lucide-react';

type Contract = {
  document_id: string;
  title: string | null;
  status: string | null;
  category: string | null;
  classification: string | null;
  counterparty: string | null;
  total_amount: number | null;
  prepayment: number | null;
  prepayment_due: string | null;
  interim_payment: number | null;
  interim_due: string | null;
  balance_payment: number | null;
  balance_due: string | null;
  settlement_ratio: number | null;
  settlement_method: string | null;
  settlement_date: string | null;
  summary: string | null;
  special_terms: string | null;
  contract_start: string | null;
  contract_end: string | null;
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

const CATEGORY_CLASS: Record<string, string> = {
  웹툰: 'bg-violet-500/10 text-violet-700 border-violet-200',
  굿즈: 'bg-amber-500/10 text-amber-700 border-amber-200',
  카페: 'bg-orange-500/10 text-orange-700 border-orange-200',
  인사: 'bg-blue-500/10 text-blue-700 border-blue-200',
  총무: 'bg-slate-500/10 text-slate-600 border-slate-200',
  자금: 'bg-green-500/10 text-green-700 border-green-200',
  기타: 'bg-gray-500/10 text-gray-500 border-gray-200',
};

const LIMIT = 50;
const CATEGORIES = ['웹툰', '굿즈', '카페', '인사', '총무', '자금', '기타'];

function fmtAmount(n: number | null) {
  if (!n) return null;
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만`;
  return n.toLocaleString() + '원';
}

function fmtAmountFull(n: number | null) {
  if (!n) return null;
  return n.toLocaleString() + '원';
}

// ── 상세 모달 ─────────────────────────────────────
function ContractModal({
  c,
  onClose,
  onUpdate,
}: {
  c: Contract;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Contract>) => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [saving, setSaving] = useState<'category' | 'classification' | null>(null);
  const [saved, setSaved] = useState<'category' | 'classification' | null>(null);

  const openPdf = async () => {
    setPdfLoading(true);
    try {
      // 새 탭 미리 열어두기 (팝업 차단 방지)
      const tab = window.open('', '_blank');
      const res = await settlementFetch(`/api/accounting/settlement/modusign/${c.document_id}/pdf`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (tab) tab.location.href = data.url;
      } else {
        alert(data.error || 'PDF를 불러올 수 없습니다.');
        tab?.close();
      }
    } catch {
      alert('PDF 조회 중 오류가 발생했습니다.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleFieldChange = async (field: 'category' | 'classification', value: string) => {
    setSaving(field);
    try {
      const res = await settlementFetch(`/api/accounting/settlement/modusign/${c.document_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      onUpdate(c.document_id, { [field]: value || null });
      setSaved(field);
      setTimeout(() => setSaved(null), 1500);
    } catch {
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(null);
    }
  };

  const signers = (c.participants || [])
    .filter(p => p.type === 'SIGNER')
    .map(p => p.name);

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    value ? (
      <div className="flex gap-3 py-2 border-b border-border/50 last:border-0">
        <dt className="w-28 shrink-0 text-xs text-muted-foreground pt-0.5">{label}</dt>
        <dd className="text-xs flex-1 leading-relaxed">{value}</dd>
      </div>
    ) : null
  );

  const hasPayment = c.total_amount || c.prepayment || c.interim_payment || c.balance_payment;
  const hasSettlement = c.settlement_ratio || c.settlement_method || c.settlement_date;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug pr-6">{c.title}</DialogTitle>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs gap-1.5 w-fit"
            onClick={openPdf}
            disabled={pdfLoading}
          >
            {pdfLoading
              ? <><Loader2 className="h-3 w-3 animate-spin" />불러오는 중…</>
              : <><FileText className="h-3 w-3" />원본 계약서 PDF 보기</>
            }
          </Button>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* 기본 정보 */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">기본 정보</h3>
            <dl>
              <Row label="상태" value={
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CLASS[c.status || ''] || ''}`}>
                  {STATUS_LABEL[c.status || ''] || c.status}
                </span>
              } />
              {/* 카테고리 — 인라인 편집 */}
              <div className="flex gap-3 py-2 border-b border-border/50 items-center">
                <dt className="w-28 shrink-0 text-xs text-muted-foreground">카테고리</dt>
                <dd className="flex-1 flex items-center gap-1.5">
                  <select
                    value={c.category || ''}
                    onChange={e => handleFieldChange('category', e.target.value)}
                    disabled={saving === 'category'}
                    className="text-xs border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">미분류</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {saving === 'category' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {saved === 'category' && <Check className="h-3 w-3 text-emerald-500" />}
                  {saving !== 'category' && saved !== 'category' && <Pencil className="h-3 w-3 text-muted-foreground/40" />}
                </dd>
              </div>
              {/* 분류(매출/매입) — 인라인 편집 */}
              <div className="flex gap-3 py-2 border-b border-border/50 items-center">
                <dt className="w-28 shrink-0 text-xs text-muted-foreground">분류</dt>
                <dd className="flex-1 flex items-center gap-1.5">
                  <select
                    value={c.classification || ''}
                    onChange={e => handleFieldChange('classification', e.target.value)}
                    disabled={saving === 'classification'}
                    className="text-xs border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  >
                    <option value="">미분류</option>
                    <option value="매출">매출</option>
                    <option value="매입">매입</option>
                  </select>
                  {saving === 'classification' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {saved === 'classification' && <Check className="h-3 w-3 text-emerald-500" />}
                  {saving !== 'classification' && saved !== 'classification' && <Pencil className="h-3 w-3 text-muted-foreground/40" />}
                </dd>
              </div>
              <Row label="거래처" value={c.counterparty} />
              <Row label="서명자" value={signers.join(', ') || null} />
              <Row label="라벨" value={
                (c.labels || []).length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {(c.labels || []).map(l => (
                      <span key={l.name} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-700 border border-cyan-200">
                        {l.name}
                      </span>
                    ))}
                  </span>
                ) : null
              } />
              <Row label="계약기간" value={
                c.contract_start
                  ? `${c.contract_start}${c.contract_end ? ` ~ ${c.contract_end}` : ''}`
                  : null
              } />
              <Row label="발송일" value={c.sent_at?.slice(0, 10) || null} />
              <Row label="체결일" value={c.completed_at?.slice(0, 10) || null} />
            </dl>
          </section>

          {/* 계약금액 */}
          {hasPayment && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">계약금액</h3>
              <dl>
                <Row label="총 계약금" value={fmtAmountFull(c.total_amount)} />
                <Row label="선금" value={
                  c.prepayment ? `${fmtAmountFull(c.prepayment)}${c.prepayment_due ? ` (${c.prepayment_due})` : ''}` : null
                } />
                <Row label="중도금" value={
                  c.interim_payment ? `${fmtAmountFull(c.interim_payment)}${c.interim_due ? ` (${c.interim_due})` : ''}` : null
                } />
                <Row label="잔금" value={
                  c.balance_payment ? `${fmtAmountFull(c.balance_payment)}${c.balance_due ? ` (${c.balance_due})` : ''}` : null
                } />
              </dl>
            </section>
          )}

          {/* 정산 */}
          {hasSettlement && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">정산</h3>
              <dl>
                <Row label="정산비율" value={c.settlement_ratio ? `${(c.settlement_ratio * 100).toFixed(1)}%` : null} />
                <Row label="정산방식" value={c.settlement_method} />
                <Row label="정산일" value={c.settlement_date} />
              </dl>
            </section>
          )}

          {/* 계약 내용 */}
          {(c.summary || c.special_terms) && (
            <section>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">계약 내용</h3>
              <dl>
                <Row label="계약사항 요약" value={c.summary} />
                <Row label="특약" value={c.special_terms} />
              </dl>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 메인 페이지 ───────────────────────────────────
export default function ModusignPage() {
  const { profile } = useStore();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<Contract | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        ...(statusFilter && { status: statusFilter }),
        ...(categoryFilter && { category: categoryFilter }),
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
  }, [page, statusFilter, categoryFilter, search]);

  useEffect(() => {
    if (profile && canViewAccounting(profile.role)) load();
  }, [profile, load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const totalPages = Math.ceil(total / LIMIT);

  const handleUpdate = useCallback((id: string, patch: Partial<Contract>) => {
    setContracts(prev => prev.map(c => c.document_id === id ? { ...c, ...patch } : c));
    setSelected(prev => prev?.document_id === id ? { ...prev, ...patch } : prev);
  }, []);

  if (!profile) return <div className="flex items-center justify-center h-full">Loading...</div>;
  if (!canViewAccounting(profile.role)) return null;

  const signerNames = (c: Contract) =>
    (c.participants || [])
      .filter(p => p.type === 'SIGNER' && p.name !== '더그림엔터테인먼트')
      .map(p => p.name)
      .join(', ') || '-';

  return (
    <div className="space-y-4">
      {selected && <ContractModal c={selected} onClose={() => setSelected(null)} onUpdate={handleUpdate} />}

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
          {/* 필터 */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {(['', 'COMPLETED', 'WAIT_FOR_SIGNING', 'REQUEST_CANCELLED', 'SIGNING_CANCELLED', 'REJECTED'] as const).map(s => (
                <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${statusFilter === s ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'}`}>
                  {s === '' ? '전체 상태' : STATUS_LABEL[s] || s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <div className="flex flex-wrap gap-1">
                <button onClick={() => { setCategoryFilter(''); setPage(1); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${categoryFilter === '' ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'}`}>
                  전체 카테고리
                </button>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => { setCategoryFilter(cat); setPage(1); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${categoryFilter === cat ? 'bg-foreground text-background border-foreground' : 'bg-transparent text-muted-foreground border-border hover:bg-muted'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 ml-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="계약서명 검색..." value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="pl-8 h-7 text-xs w-52" />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={handleSearch}>검색</Button>
              </div>
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
                    <th className="py-2 px-3 font-medium whitespace-nowrap">카테고리</th>
                    <th className="py-2 px-3 font-medium">계약서명</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">거래처</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">매출/매입</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap text-right">계약금</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">계약기간</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">라벨</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">체결일</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => (
                    <tr key={c.document_id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setSelected(c)}>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CLASS[c.status || ''] || 'bg-muted text-muted-foreground border-border'}`}>
                          {STATUS_LABEL[c.status || ''] || c.status || '-'}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {c.category ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${CATEGORY_CLASS[c.category] || CATEGORY_CLASS['기타']}`}>
                            {c.category}
                          </span>
                        ) : <span className="text-muted-foreground/30">-</span>}
                      </td>
                      <td className="py-1.5 px-3 max-w-[300px]">
                        <span className="line-clamp-1 font-medium">{c.title || '-'}</span>
                        {c.summary && (
                          <span className="line-clamp-1 text-[10px] text-muted-foreground mt-0.5 block">{c.summary}</span>
                        )}
                        {c.special_terms && (
                          <span className="line-clamp-1 text-[10px] text-amber-600/80 mt-0.5 block">특약: {c.special_terms}</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {c.counterparty || <span className="text-muted-foreground/30">-</span>}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {c.classification ? (
                          <span className={`font-medium ${c.classification === '매출' ? 'text-emerald-600' : 'text-blue-600'}`}>
                            {c.classification}
                          </span>
                        ) : <span className="text-muted-foreground/30">-</span>}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap tabular-nums text-right">
                        {fmtAmount(c.total_amount) || <span className="text-muted-foreground/30">-</span>}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap tabular-nums text-muted-foreground text-[10px]">
                        {c.contract_start
                          ? `${c.contract_start}${c.contract_end ? ` ~ ${c.contract_end}` : ''}`
                          : <span className="text-muted-foreground/30">-</span>}
                      </td>
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        {(c.labels || []).map(l => (
                          <span key={l.name} className="inline-flex items-center px-1.5 py-0.5 mr-1 rounded text-[10px] bg-cyan-500/10 text-cyan-700 border border-cyan-200">
                            {l.name}
                          </span>
                        ))}
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
