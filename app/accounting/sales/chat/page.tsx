'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewSales } from '@/lib/utils/permissions';
import { useSearchParams, useRouter } from 'next/navigation';
import { User, Send, Loader2, Sparkles, Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const EXAMPLES = [
  '전체 매출 요약해줘',
  '외모지상주의 최근 30일 추이',
  '매출 1위 작품은?',
  '연재일 매출 급등 패턴 분석',
  '싸움독학이랑 외모지상주의 비교',
  '가장 성장률이 높은 작품은?',
  '어제 매출 가장 높은 작품 3개',
  '요일별 매출 패턴 분석',
];

export default function ChatPage() {
  const { profile } = useStore();
  const { toggleSidebar } = useSidebar();
  const router = useRouter();
  const searchParams = useSearchParams();
  const convId = searchParams.get('id');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(convId);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversation if id in URL
  useEffect(() => {
    if (!convId) {
      setMessages([]);
      setConversationId(null);
      return;
    }
    setConversationId(convId);
    setLoadingHistory(true);
    fetch(`/api/accounting/sales/chat/conversations/${convId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMessages(data.map((m: any) => ({ role: m.role, content: m.content })));
        }
      })
      .finally(() => setLoadingHistory(false));
  }, [convId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/accounting/sales/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, conversationId }),
      });
      const data = await res.json();
      const reply = data.error ? `오류: ${data.error}` : data.reply;
      setMessages([...newMessages, { role: 'assistant', content: reply }]);

      // Update conversationId and URL if new conversation was created
      if (data.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
        router.replace(`/accounting/sales/chat?id=${data.conversationId}`, { scroll: false });
        // Trigger sidebar refresh
        window.dispatchEvent(new Event('chat-conversations-changed'));
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, conversationId, router]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    router.replace('/accounting/sales/chat', { scroll: false });
  }, [router]);

  if (!profile || !canViewSales(profile.role)) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {/* 헤더 */}
      <div className="flex items-center gap-3.5 mb-5">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-[0_4px_12px_rgba(99,102,241,0.3)]">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">AI 검색</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">일별 매출 데이터를 자연어로 검색하고 분석합니다</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={startNewChat}
              className="px-3.5 py-1.5 text-xs font-medium rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
            >
              새 대화
            </button>
          )}
          <button
            onClick={toggleSidebar}
            className="md:hidden h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all duration-200"
          >
            <Menu className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 rounded-2xl bg-white dark:bg-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:shadow-none dark:border dark:border-zinc-800 flex flex-col overflow-hidden">
        {/* 메시지 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {loadingHistory && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full space-y-8">
              <div className="space-y-3 text-center">
                <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 flex items-center justify-center mx-auto">
                  <Sparkles className="h-8 w-8 text-blue-500/40 dark:text-blue-400/40" />
                </div>
                <p className="text-base font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">매출 데이터에 대해 질문하세요</p>
                <p className="text-sm text-zinc-400 dark:text-zinc-500">작품별 매출, 추이 분석, 비교, 성장률 등</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {EXAMPLES.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-4 py-2 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all duration-200"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 h-7 w-7 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mt-0.5 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
              }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 h-7 w-7 rounded-xl bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center mt-0.5">
                  <User className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-2.5 text-sm text-zinc-500 dark:text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>분석 중...</span>
              </div>
            </div>
          )}
        </div>

        {/* 입력 */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <div className="flex items-end gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all duration-200">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="질문을 입력하세요..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none max-h-24 text-zinc-800 dark:text-zinc-200"
              style={{ minHeight: '24px' }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 96) + 'px';
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="flex-shrink-0 h-8 w-8 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 disabled:text-zinc-400 text-white flex items-center justify-center transition-all duration-200 hover:shadow-sm"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
