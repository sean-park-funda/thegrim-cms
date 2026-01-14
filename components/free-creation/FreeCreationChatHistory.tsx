'use client';

import { useRef, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { FreeCreationMessageWithFile } from '@/lib/supabase';
import { FreeCreationMessageItem } from './FreeCreationMessageItem';

interface FreeCreationChatHistoryProps {
  messages: FreeCreationMessageWithFile[];
  onImageClick?: (imageUrl: string, imageName: string) => void;
  onMessageClick?: (message: FreeCreationMessageWithFile) => void;
  onRetry?: (message: FreeCreationMessageWithFile) => void;
  onAddAsReference?: (fileId: string, imageUrl: string, fileName: string) => void;
  autoScroll?: boolean;
}

export function FreeCreationChatHistory({
  messages,
  onImageClick,
  onMessageClick,
  onRetry,
  onAddAsReference,
  autoScroll = true,
}: FreeCreationChatHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 추가되면 스크롤
  useEffect(() => {
    if (autoScroll && scrollRef.current && bottomRef.current) {
      // 스크롤 컨테이너의 스크롤을 맨 아래로 이동
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, autoScroll]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
        <Wand2 className="h-16 w-16 mb-4 opacity-20" />
        <h3 className="text-lg font-medium mb-2">자유창작 시작하기</h3>
        <p className="text-sm text-center max-w-md">
          프롬프트를 입력하여 이미지를 생성하세요.<br />
          레퍼런스 이미지를 추가하면 스타일을 참고합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
      <div className="p-4 space-y-4">
        {messages.map((message) => (
          <FreeCreationMessageItem
            key={message.id}
            message={message}
            onImageClick={onImageClick}
            onMessageClick={onMessageClick}
            onRetry={onRetry}
            onAddAsReference={onAddAsReference}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
