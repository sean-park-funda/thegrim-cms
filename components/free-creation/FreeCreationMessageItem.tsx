'use client';

import { useMemo } from 'react';
import { Loader2, AlertCircle, RotateCcw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FreeCreationMessageWithFile, ReferenceFile } from '@/lib/supabase';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface FreeCreationMessageItemProps {
  message: FreeCreationMessageWithFile;
  onImageClick?: (imageUrl: string, imageName: string) => void;
  onMessageClick?: (message: FreeCreationMessageWithFile) => void;
  onRetry?: (message: FreeCreationMessageWithFile) => void;
  onAddAsReference?: (fileId: string, imageUrl: string, fileName: string) => void;
}

export function FreeCreationMessageItem({
  message,
  onImageClick,
  onMessageClick,
  onRetry,
  onAddAsReference,
}: FreeCreationMessageItemProps) {
  const isGenerating = message.status === 'pending' || message.status === 'generating';
  const isError = message.status === 'error';
  const isCompleted = message.status === 'completed';

  const imageUrl = useMemo(() => {
    if (!message.generated_file) return null;
    return message.generated_file.file_path;
  }, [message.generated_file]);

  const modelName = useMemo(() => {
    if (message.api_provider === 'gemini') return 'Gemini';
    if (message.api_provider === 'seedream') return 'Seedream';
    return 'Auto';
  }, [message.api_provider]);

  const referenceFiles = (message.reference_files || []) as unknown as ReferenceFile[];

  return (
    <div
      className={cn(
        'group rounded-lg border bg-card p-4 transition-colors',
        onMessageClick && 'cursor-pointer hover:bg-muted/50'
      )}
      onClick={() => onMessageClick?.(message)}
    >
      {/* 프롬프트 */}
      <div className="mb-3">
        <p className="text-sm whitespace-pre-wrap">{message.prompt}</p>
      </div>

      {/* 레퍼런스 이미지 (있는 경우) */}
      {referenceFiles.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1">레퍼런스:</p>
          <div className="flex flex-wrap gap-1">
            {referenceFiles.map((ref) => {
              const thumbnailUrl = ref.thumbnail_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/webtoon-files/${ref.thumbnail_path}`
                : ref.file_path;

              return (
                <div
                  key={ref.id}
                  className="w-10 h-10 rounded overflow-hidden border"
                >
                  <Image
                    src={thumbnailUrl}
                    alt={ref.file_name}
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 생성된 이미지 또는 상태 */}
      <div className="relative">
        {isGenerating && (
          <div className="aspect-square max-w-md rounded-lg bg-gradient-to-r from-violet-500/20 via-purple-400/40 to-indigo-500/20 bg-[length:200%_100%] animate-shimmer flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">이미지 생성 중...</span>
            </div>
          </div>
        )}

        {isError && (
          <div className="aspect-square max-w-md rounded-lg bg-destructive/10 border border-destructive/20 flex flex-col items-center justify-center p-4">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive text-center">
              {message.error_message || '이미지 생성에 실패했습니다.'}
            </p>
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(message);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                다시 시도
              </Button>
            )}
          </div>
        )}

        {isCompleted && imageUrl && (
          <div
            className="relative aspect-square max-w-md rounded-lg overflow-hidden cursor-pointer group/image"
            onClick={(e) => {
              e.stopPropagation();
              onImageClick?.(imageUrl, message.generated_file?.file_name || 'generated-image');
            }}
          >
            <Image
              src={imageUrl}
              alt="Generated image"
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 400px"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center gap-2">
              {/* 확대 아이콘 */}
              <div className="opacity-0 group-hover/image:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {/* 레퍼런스로 추가 버튼 */}
              {onAddAsReference && message.generated_file?.id && (
                <button
                  type="button"
                  className="opacity-0 group-hover/image:opacity-100 transition-opacity bg-primary text-primary-foreground rounded-full p-2 hover:bg-primary/90"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddAsReference(
                      message.generated_file!.id,
                      imageUrl,
                      message.generated_file?.file_name || 'generated-image'
                    );
                  }}
                  title="레퍼런스로 추가"
                >
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 메타 정보 */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {modelName}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {message.aspect_ratio}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(message.created_at).toLocaleString('ko-KR')}
        </span>
      </div>
    </div>
  );
}
