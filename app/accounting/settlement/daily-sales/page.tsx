'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { settlementFetch } from '@/lib/settlement/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, DollarSign, BookOpen, Crown, Bot, User, Send, Loader2, MessageCircle, X } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const WORK_COLORS = [
  '#2563eb', '#a855f7', '#0d9488', '#f59e0b', '#6366f1',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
  '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#22c55e',
];

const fmtShort = (n: number) => {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString();
};

const PRESETS = [
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '60일', days: 60 },
  { label: '90일', days: 90 },
];

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface DailySalesData {
  sales: Array<{
    id: string;
    account_id: number;
    work_name: string;
    sale_date: string;
    platform: string;
    amount: string;
  }>;
  works: Record<string, { date: string; amount: number }[]>;
  summary: {
    totalSales: number;
    dailyAverage: number;
    workCount: number;
    topWork: { name: string; total: number } | null;
    dailyTotals: { date: string; total: number }[];
    workTotals: { name: string; total: number }[];
  };
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 shadow-xl max-h-80 overflow-y-auto">
      <p className="mb-1.5 text-sm font-semibold">{label}</p>
      {payload.filter(p => p.value > 0).sort((a, b) => b.value - a.value).map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs leading-relaxed">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground truncate max-w-32">{p.name}</span>
          <span className="ml-auto tabular-nums font-medium">{fmtShort(p.value)}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1.5 pt-1.5 border-t text-xs font-semibold flex justify-between">
          <span>합계</span>
          <span className="tabular-nums">{fmtShort(total)}</span>
        </div>
      )}
    </div>
  );
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function DailySalesPage() {
  const { profile } = useStore();
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (chatOpen) chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/accounting/settlement/daily-sales/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setChatMessages([...newMessages, { role: 'assistant', content: data.error ? `오류: ${data.error}` : data.reply }]);
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }]);
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatInput, chatLoading, chatMessages]);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - days);
    return { from: dateStr(fromDate), to: dateStr(now) };
  }, [days]);

  useEffect(() => {
    if (!profile || !canViewAccounting(profile.role)) return;

    setLoading(true);
    settlementFetch(`/api/accounting/settlement/daily-sales?from=${from}&to=${to}`)
      .then(r => r.json())
      .then((d: DailySalesData) => {
        setData(d);
        // 기본: 상위 5개 작품 선택
        if (d.summary?.workTotals) {
          setSelectedWorks(new Set(d.summary.workTotals.slice(0, 5).map(w => w.name)));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [profile, from, to]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  // 차트 데이터 변환
  const chartData = useMemo(() => {
    if (!data?.summary?.dailyTotals) return [];
    const allDates = data.summary.dailyTotals.map(d => d.date);
    return allDates.map(date => {
      const point: Record<string, string | number> = { date: date.slice(5) }; // MM-DD
      for (const [workName, rows] of Object.entries(data.works)) {
        if (selectedWorks.has(workName)) {
          const row = rows.find(r => r.date === date);
          point[workName] = row ? row.amount : 0;
        }
      }
      return point;
    });
  }, [data, selectedWorks]);

  const workNames = useMemo(() =>
    data?.summary?.workTotals?.map(w => w.name) || [],
  [data]);

  const toggleWork = (name: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAll = () => setSelectedWorks(new Set(workNames));
  const selectNone = () => setSelectedWorks(new Set());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">일별 매출 추이</h1>
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <Button
              key={p.days}
              variant={days === p.days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(p.days)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">로딩 중...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">데이터 없음</div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">총 매출</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtShort(data.summary.totalSales)}</div>
                <p className="text-xs text-muted-foreground">{days}일간</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">일 평균</CardTitle>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmtShort(data.summary.dailyAverage)}</div>
                <p className="text-xs text-muted-foreground">하루 평균 매출</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">작품 수</CardTitle>
                <BookOpen className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.workCount}개</div>
                <p className="text-xs text-muted-foreground">매출 발생 작품</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">1위 작품</CardTitle>
                <Crown className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold truncate">{data.summary.topWork?.name || '-'}</div>
                <p className="text-xs text-muted-foreground">
                  {data.summary.topWork ? fmtShort(data.summary.topWork.total) : '-'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 작품 선택 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">작품 선택</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>전체 선택</Button>
                  <Button variant="ghost" size="sm" onClick={selectNone}>전체 해제</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {workNames.map((name, i) => (
                  <Button
                    key={name}
                    variant={selectedWorks.has(name) ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs"
                    style={selectedWorks.has(name) ? { backgroundColor: WORK_COLORS[i % WORK_COLORS.length] } : {}}
                    onClick={() => toggleWork(name)}
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>일별 매출 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} className="stroke-border" />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} className="stroke-border" />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                    />
                    {workNames.filter(n => selectedWorks.has(n)).map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={WORK_COLORS[workNames.indexOf(name) % WORK_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 작품별 매출 순위 */}
          <Card>
            <CardHeader>
              <CardTitle>작품별 매출 순위 ({days}일)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.summary.workTotals.map((w, i) => {
                  const ratio = data.summary.workTotals[0]?.total
                    ? (w.total / data.summary.workTotals[0].total) * 100
                    : 0;
                  return (
                    <div key={w.name} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-6 text-right text-muted-foreground">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{w.name}</span>
                          <span className="text-sm tabular-nums">{fmtShort(w.total)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${ratio}%`,
                              backgroundColor: WORK_COLORS[i % WORK_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Floating Chat Button */}
      <button
        onClick={() => setChatOpen(prev => !prev)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/30 flex items-center justify-center hover:scale-105 transition-transform"
      >
        {chatOpen ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
      </button>

      {/* Chat Panel */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[420px] h-[520px] rounded-2xl border bg-card shadow-2xl flex flex-col overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-gradient-to-r from-cyan-500/5 to-blue-500/5">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">매출 AI 분석</p>
              <p className="text-[10px] text-muted-foreground">일별 매출 데이터를 자연어로 검색</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
                <Bot className="h-10 w-10 opacity-20" />
                <p className="text-xs">매출 데이터에 대해 질문하세요</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[
                    '전체 매출 요약',
                    '외모지상주의 추이',
                    '매출 1위 작품은?',
                    '연재일 매출 급등 분석',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => { setChatInput(q); chatInputRef.current?.focus(); }}
                      className="px-2.5 py-1 text-[11px] rounded-full border hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 h-6 w-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/10 border border-cyan-200 dark:border-cyan-800'
                    : 'bg-muted border border-border'
                }`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 h-6 w-6 rounded-md bg-muted flex items-center justify-center mt-0.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-muted border rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>분석 중...</span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div className="border-t px-3 py-2.5">
            <div className="flex items-end gap-2 bg-muted/50 rounded-lg border px-3 py-2 focus-within:border-cyan-500/50 transition-colors">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="질문을 입력하세요..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none max-h-20"
                style={{ minHeight: '20px' }}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 80) + 'px';
                }}
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || chatLoading}
                className="flex-shrink-0 h-7 w-7 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground text-white flex items-center justify-center transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
