'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store/useStore';
import { canViewAccounting } from '@/lib/utils/permissions';
import { Card } from '@/components/ui/card';
import { Bot, User, Send, Loader2 } from 'lucide-react';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.error ? `오류: ${data.error}` : data.reply }]);
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages]);

  if (!profile || !canViewAccounting(profile.role)) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold">매출 AI 검색</h1>
          <p className="text-xs text-muted-foreground">일별 매출 데이터를 자연어로 검색하고 분석합니다</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-6">
              <Bot className="h-14 w-14 opacity-15" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">매출 데이터에 대해 질문하세요</p>
                <p className="text-xs">작품별 매출, 추이 분석, 비교, 패턴 등</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {EXAMPLES.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="px-3 py-1.5 text-xs rounded-full border hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
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
                <div className="flex-shrink-0 h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mt-0.5">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-cyan-500/10 border border-cyan-200 dark:border-cyan-800'
                  : 'bg-muted border border-border'
              }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="flex-shrink-0 h-7 w-7 rounded-md bg-muted flex items-center justify-center mt-0.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-muted border rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>분석 중...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3">
          <div className="flex items-end gap-3 bg-muted/50 rounded-xl border px-4 py-3 focus-within:border-cyan-500/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="질문을 입력하세요... (예: 외모지상주의 최근 매출 추이)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none max-h-24"
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
              className="flex-shrink-0 h-8 w-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground text-white flex items-center justify-center transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
