'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { Loader2, User, Calendar, Eye, EyeOff, ExternalLink, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { ImageViewer } from './ImageViewer';
import { RemixImageDialog } from './RemixImageDialog';
import { useStore } from '@/lib/store/useStore';
import { useRouter } from 'next/navigation';

interface DerivedImage {
  fileId: string;
  filePath: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  description?: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
  creator?: {
    id: string;
    name: string;
    email: string;
  };
  process?: {
    id: string;
    name: string;
    color: string;
  };
}

interface DerivedImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceFileId: string | null;
  sourceFileName?: string;
  sourceFileUrl?: string;
}

export function DerivedImagesDialog({
  open,
  onOpenChange,
  sourceFileId,
  sourceFileName,
  sourceFileUrl,
}: DerivedImagesDialogProps) {
  const router = useRouter();
  const { profile } = useStore();
  const [derivedImages, setDerivedImages] = useState<DerivedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImageTitle, setViewerImageTitle] = useState<string>('');
  const [remixDialogOpen, setRemixDialogOpen] = useState(false);
  const [selectedImageForRemix, setSelectedImageForRemix] = useState<DerivedImage | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const loadDerivedImages = async () => {
      if (!open || !sourceFileId || !isMountedRef.current) return;

      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (profile?.id) {
          params.set('currentUserId', profile.id);
        }
        const response = await fetch(`/api/files/${sourceFileId}/derived?${params.toString()}`);

        if (!isMountedRef.current) return;

        if (response.ok) {
          const data = await response.json();
          setDerivedImages(data.derivedImages || []);
          setTotalCount(data.total || 0);
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        console.error('파생 이미지 로드 실패:', error);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    if (open && sourceFileId) {
      loadDerivedImages();
    } else {
      // 다이얼로그가 닫힐 때 상태 초기화
      setDerivedImages([]);
      setTotalCount(0);
      setLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [open, sourceFileId, profile?.id]);

  const handleImageClick = (image: DerivedImage) => {
    setViewerImageUrl(image.fileUrl);
    setViewerImageTitle(`파생 이미지 - ${format(new Date(image.createdAt), 'yyyy-MM-dd HH:mm')}`);
  };

  const handleGoToFile = (e: React.MouseEvent, image: DerivedImage) => {
    e.stopPropagation();
    onOpenChange(false);
    router.push(`/files/${image.fileId}`);
  };

  const handleRemixClick = (e: React.MouseEvent, image: DerivedImage) => {
    e.stopPropagation();
    setSelectedImageForRemix(image);
    setRemixDialogOpen(true);
  };

  // DerivedImage를 RemixImageDialog의 HistoryItem 형식으로 변환
  const convertToHistoryItem = (image: DerivedImage) => ({
    fileId: image.fileId,
    filePath: image.filePath,
    fileUrl: image.fileUrl,
    createdAt: image.createdAt,
    mimeType: image.mimeType,
    prompt: image.prompt,
    sourceFileId: sourceFileId || undefined, // 원본 파일 ID
    description: image.description,
    metadata: image.metadata,
    sourceFile: sourceFileId ? {
      id: sourceFileId,
      filePath: sourceFileUrl || '',
      fileUrl: sourceFileUrl || '',
      fileName: sourceFileName || '',
    } : undefined,
    creator: image.creator,
    process: image.process,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              파생 이미지 목록
              {sourceFileName && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({sourceFileName})
                </span>
              )}
              {totalCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {totalCount}개
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4 max-h-[calc(85vh-100px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : derivedImages.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p>이 원본으로 생성된 파생 이미지가 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-4">
                {derivedImages.map((image) => (
                  <div key={image.fileId} className="relative space-y-2">
                    <div
                      className="relative w-full aspect-square bg-muted rounded-md overflow-hidden group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => handleImageClick(image)}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                      
                      {/* 공개/비공개 배지 */}
                      <div className="absolute top-2 left-2 z-20">
                        {image.isPublic ? (
                          <Badge variant="secondary" className="gap-1 text-xs">
                            <Eye className="h-3 w-3" />
                            공개
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-xs bg-background/80">
                            <EyeOff className="h-3 w-3" />
                            비공개
                          </Badge>
                        )}
                      </div>

                      {/* 파일 상세 보기 버튼 */}
                      <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => handleGoToFile(e, image)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {image.fileUrl && (
                        <Image
                          src={image.fileUrl}
                          alt="파생 이미지"
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                          unoptimized={true}
                          onError={(e) => {
                            console.error('[파생 이미지 로드 실패]', {
                              fileId: image.fileId,
                              fileUrl: image.fileUrl,
                            });
                          }}
                        />
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      {/* 생성자 + 날짜 */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {image.creator && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span className="truncate max-w-[80px]">{image.creator.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(image.createdAt), 'MM.dd HH:mm')}</span>
                        </div>
                      </div>

                      {/* 공정 */}
                      {image.process && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{ borderColor: image.process.color, color: image.process.color }}
                        >
                          {image.process.name}
                        </Badge>
                      )}

                      {/* 프롬프트 */}
                      {image.prompt && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {image.prompt}
                        </div>
                      )}

                      {/* 리믹스 버튼 */}
                      {sourceFileId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-2 h-7 text-xs"
                          onClick={(e) => handleRemixClick(e, image)}
                        >
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          리믹스
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {viewerImageUrl && (
        <ImageViewer
          imageUrl={viewerImageUrl}
          imageName={viewerImageTitle}
          open={!!viewerImageUrl}
          onOpenChange={(open) => {
            if (!open) {
              setViewerImageUrl(null);
              setViewerImageTitle('');
            }
          }}
        />
      )}

      {/* 리믹스 Dialog */}
      <RemixImageDialog
        open={remixDialogOpen}
        onOpenChange={(open) => {
          setRemixDialogOpen(open);
          if (!open) {
            setSelectedImageForRemix(null);
          }
        }}
        image={selectedImageForRemix ? convertToHistoryItem(selectedImageForRemix) : null}
      />
    </>
  );
}

