'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettlementStore } from '@/lib/store/useSettlementStore';
import { Send, Bot, User, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const { selectedMonth } = useSettlementStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/accounting/settlement/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, selectedMonth }),
      });

      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: 'assistant', content: `오류: ${data.error}` }]);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '네트워크 오류가 발생했습니다.' }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, selectedMonth]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">정산 AI 어시스턴트</h1>
          <p className="text-xs text-muted-foreground">매출, 정산, MG 등을 자연어로 검색하세요 · {selectedMonth} 기준</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-6">
            <Bot className="h-12 w-12 opacity-30" />
            <div className="text-center space-y-2">
              <p className="text-sm">정산 데이터에 대해 자유롭게 질문하세요</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {[
                  '이번 달 전체 매출 요약',
                  '유호빈 정산 내역',
                  '외모지상주의 매출 추이',
                  'MG 잔액 현황',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="px-3 py-1.5 text-xs rounded-full border border-border hover:border-cyan-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
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
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-cyan-500/10 text-cyan-900 dark:text-cyan-100 border border-cyan-200 dark:border-cyan-800'
                  : 'bg-muted text-foreground border border-border'
              }`}
            >
              {msg.content}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 h-7 w-7 rounded-md bg-muted flex items-center justify-center mt-0.5">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-md bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mt-0.5">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-muted border border-border rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>데이터 조회 중...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border pt-4 pb-2">
        <div className="flex items-end gap-2 bg-muted/50 rounded-xl border border-border px-4 py-3 focus-within:border-cyan-500/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32"
            style={{ minHeight: '24px' }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 128) + 'px';
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 h-8 w-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-muted disabled:text-muted-foreground text-white flex items-center justify-center transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">Enter로 전송 · Shift+Enter로 줄바꿈</p>
      </div>
    </div>
  );
}
