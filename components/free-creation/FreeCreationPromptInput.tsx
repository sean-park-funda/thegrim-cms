'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Plus, X, Loader2, ImageIcon, Trash2 } from 'lucide-react';
import { ReferenceFile, ApiProvider } from '@/lib/supabase';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface FreeCreationPromptInputProps {
  selectedReferences: ReferenceFile[];
  onReferenceRemove: (referenceId: string) => void;
  onReferenceAdd: () => void;
  onSubmit: (prompt: string, aspectRatio: string, imageCount: number) => void;
  onClear?: () => void;
  isGenerating: boolean;
  apiProvider: ApiProvider;
  onDrop?: (files: File[]) => void;
  initialPrompt?: string;
  initialAspectRatio?: string;
}

export function FreeCreationPromptInput({
  selectedReferences,
  onReferenceRemove,
  onReferenceAdd,
  onSubmit,
  onClear,
  isGenerating,
  apiProvider,
  onDrop,
  initialPrompt,
  initialAspectRatio,
}: FreeCreationPromptInputProps) {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageCount, setImageCount] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 외부에서 전달받은 초기값으로 프롬프트와 비율 설정
  useEffect(() => {
    if (initialPrompt !== undefined) {
      setPrompt(initialPrompt);
      // 텍스트 영역에 포커스
      if (textareaRef.current) {
        textareaRef.current.focus();
        // 커서를 끝으로 이동
        const length = initialPrompt.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (initialAspectRatio !== undefined) {
      setAspectRatio(initialAspectRatio);
    }
  }, [initialAspectRatio]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isGenerating) return;
    onSubmit(prompt.trim(), aspectRatio, imageCount);
    setPrompt('');
  }, [prompt, aspectRatio, imageCount, isGenerating, onSubmit]);

  const handleClear = useCallback(() => {
    setPrompt('');
    if (onClear) {
      onClear();
    }
  }, [onClear]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  // 드래그앤드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDropEvent = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // JSON 데이터 확인 (좌측 패널에서 드래그한 레퍼런스)
    const jsonData = e.dataTransfer.getData('application/json');
    if (jsonData) {
      try {
        const refFile = JSON.parse(jsonData) as ReferenceFile;
        // 이미 선택된 레퍼런스인지 확인
        if (!selectedReferences.some(r => r.id === refFile.id)) {
          // 부모 컴포넌트에서 처리
        }
      } catch {
        // JSON 파싱 실패 - 파일 드롭으로 처리
      }
    }

    // 파일 드롭
    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type.startsWith('image/')
    );
    if (files.length > 0 && onDrop) {
      onDrop(files);
    }
  }, [selectedReferences, onDrop]);

  return (
    <div
      className={cn(
        'flex-shrink-0 border-t bg-background p-4 transition-colors',
        isDragOver && 'bg-primary/5 border-primary'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
    >
      {/* 선택된 레퍼런스 미리보기 */}
      {selectedReferences.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedReferences.map((ref) => {
            const thumbnailUrl = ref.thumbnail_path
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${ref.thumbnail_path}`
              : ref.file_path;

            return (
              <div
                key={ref.id}
                className="relative group"
              >
                <div className="w-16 h-16 rounded-lg overflow-hidden border">
                  <Image
                    src={thumbnailUrl}
                    alt={ref.file_name}
                    width={64}
                    height={64}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onReferenceRemove(ref.id)}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onReferenceAdd}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* 레퍼런스가 없을 때 추가 버튼 */}
      {selectedReferences.length === 0 && (
        <button
          type="button"
          onClick={onReferenceAdd}
          className="w-full mb-3 py-3 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
          <span className="text-sm">레퍼런스 이미지 추가 (선택)</span>
        </button>
      )}

      {/* 프롬프트 입력 */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="이미지를 생성할 프롬프트를 입력하세요... (Shift+Enter: 줄바꿈)"
            className="min-h-[60px] max-h-[200px] resize-none pr-32"
            disabled={isGenerating}
          />
          <div className="absolute right-2 bottom-2 flex gap-1 items-center">
            {/* Clear 버튼 */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleClear}
              disabled={!prompt.trim() || isGenerating}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {/* 이미지 개수 선택 */}
            <div className="flex gap-0.5 border rounded-md overflow-hidden">
              {[1, 2, 4].map((count) => (
                <Button
                  key={count}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0 text-xs rounded-none',
                    imageCount === count
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                  onClick={() => setImageCount(count)}
                  disabled={isGenerating}
                >
                  {count}
                </Button>
              ))}
            </div>
            {/* 비율 선택 */}
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger className="w-[70px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:1">1:1</SelectItem>
                <SelectItem value="16:9">16:9</SelectItem>
                <SelectItem value="9:16">9:16</SelectItem>
                <SelectItem value="4:3">4:3</SelectItem>
                <SelectItem value="3:4">3:4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isGenerating}
          className="h-auto px-4"
        >
          {isGenerating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* 현재 모델 표시 */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          모델: {apiProvider === 'gemini' ? 'Gemini' : apiProvider === 'seedream' ? 'Seedream' : 'Auto'}
        </span>
        {isDragOver && (
          <span className="text-primary">이미지를 여기에 놓으세요</span>
        )}
      </div>
    </div>
  );
}
