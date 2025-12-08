'use client';

import { useState } from 'react';
import { File as FileType } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileIcon, Download, Trash2, Edit, Sparkles } from 'lucide-react';
import Image from 'next/image';

interface FileCardProps {
  file: FileType;
  thumbnailUrl?: string;
  onClick: () => void;
  onDownload: (e: React.MouseEvent) => void;
  onAnalyze?: (e: React.MouseEvent) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isAnalyzing: boolean;
  isPendingAnalysis: boolean;
  hasMetadata: boolean;
  imageErrors: Set<string>;
  onImageError: (fileId: string, originalUrl: string) => void;
  canUpload: boolean;
  canDelete: boolean;
}

export function FileCard({
  file,
  thumbnailUrl,
  onClick,
  onDownload,
  onAnalyze,
  onEdit,
  onDelete,
  isAnalyzing,
  isPendingAnalysis,
  hasMetadata,
  imageErrors,
  onImageError,
  canUpload,
  canDelete,
}: FileCardProps) {
  const metadata = file.metadata as {
    scene_summary?: string;
    tags?: string[];
    characters_count?: number;
  } | undefined;

  const renderFilePreview = () => {
    const isImage = file.file_type === 'image';
    const hasError = imageErrors.has(file.id);

    if (isImage && !hasError) {
      // 썸네일 URL 우선 사용, 없으면 원본 URL 사용
      const fallbackUrl = file.file_path?.startsWith('http') 
        ? file.file_path 
        : file.file_path?.startsWith('/') 
          ? file.file_path 
          : `https://${file.file_path}`;
      const imageUrl = thumbnailUrl || fallbackUrl;

      return (
        <div className="relative w-full h-40 sm:h-48 bg-muted rounded-md overflow-hidden">
          <Image 
            src={imageUrl} 
            alt={file.file_name} 
            fill 
            className="object-cover" 
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={true}
            draggable={false}
            onError={() => {
              console.error('이미지 로딩 실패:', imageUrl, file.id);
              // 썸네일 로딩 실패 시 원본으로 fallback
              if (thumbnailUrl && imageUrl === thumbnailUrl) {
                const originalUrl = file.file_path?.startsWith('http') 
                  ? file.file_path 
                  : file.file_path?.startsWith('/') 
                    ? file.file_path 
                    : `https://${file.file_path}`;
                onImageError(file.id, originalUrl);
              } else {
                onImageError(file.id, fallbackUrl);
              }
            }}
          />
        </div>
      );
    }

    return (
      <div className="w-full h-40 sm:h-48 bg-muted rounded-md flex items-center justify-center">
        <FileIcon className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground" />
      </div>
    );
  };

  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    // 버튼 영역에서 시작된 드래그는 무시
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // dataTransfer 설정
    e.dataTransfer.setData('text/plain', file.id);
    e.dataTransfer.setData('fileId', file.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
    setHasDragged(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    // 드래그가 끝난 후 잠시 후에 hasDragged를 초기화하여 클릭 이벤트가 정상 작동하도록
    setTimeout(() => {
      setHasDragged(false);
    }, 100);
  };

  return (
    <Card 
      draggable={true}
      className={`overflow-hidden p-0 hover:shadow-md transition-all duration-200 ease-in-out cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-50 scale-95' : ''
      }`}
      onClick={(e) => {
        // 드래그가 발생했으면 클릭 무시
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.stopPropagation();
        onClick();
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {renderFilePreview()}
      <div className="p-2 sm:p-3 select-none">
        <p className="text-xs sm:text-sm font-medium truncate select-none">{file.file_name}</p>
        {file.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{file.description}</p>
        )}
        {hasMetadata && (
          <div className="mt-2 space-y-2">
            {metadata?.scene_summary && (
              <p className="text-xs text-muted-foreground line-clamp-2">{metadata.scene_summary}</p>
            )}
            {metadata?.tags && metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {metadata.tags.slice(0, 5).map((tag, idx) => (
                  <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {tag}
                  </Badge>
                ))}
                {metadata.tags.length > 5 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    +{metadata.tags.length - 5}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}
        {!hasMetadata && file.file_type === 'image' && (
          <div className="mt-1 flex items-center gap-1">
            {isPendingAnalysis ? (
              <>
                <Sparkles className="h-3 w-3 animate-pulse text-primary" />
                <p className="text-xs text-muted-foreground">메타데이터 생성 중...</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">메타데이터 없음</p>
            )}
          </div>
        )}
        <div 
          className="flex gap-1.5 sm:gap-2 mt-2" 
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" 
            onClick={onDownload}
            draggable={false}
          >
            <Download className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
          </Button>
          {file.file_type === 'image' && canUpload && onAnalyze && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" 
              onClick={onAnalyze}
              disabled={isAnalyzing}
              draggable={false}
            >
              <Sparkles className={`h-3.5 w-3.5 sm:h-3 sm:w-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
            </Button>
          )}
          {canUpload && (!file.description || file.description.trim() === '') && onEdit && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 sm:h-7 px-2 flex-1 touch-manipulation" 
              onClick={onEdit}
              draggable={false}
            >
              <Edit className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            </Button>
          )}
          {canDelete && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 sm:h-7 px-2 flex-1 text-destructive hover:text-destructive touch-manipulation" 
              onClick={onDelete}
              draggable={false}
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

