'use client';

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Search, Loader2, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { ImageViewer } from './ImageViewer';
import { useStore } from '@/lib/store/useStore';

interface HistoryItem {
  fileId: string;
  filePath: string;
  fileUrl: string;
  createdAt: string;
  mimeType: string;
  prompt?: string;
  sourceFileId?: string;
}

interface RegeneratedImageHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RegeneratedImageHistoryDialog({ open, onOpenChange }: RegeneratedImageHistoryDialogProps) {
  const { profile } = useStore();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImageTitle, setViewerImageTitle] = useState<string>('');
  const [visibilityFilter, setVisibilityFilter] = useState<'public' | 'private'>('public');
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    const loadHistory = async () => {
      if (!open || !isMountedRef.current) return;

      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '100', visibility: visibilityFilter });
        if (profile?.id) {
          params.set('currentUserId', profile.id);
        }
        const response = await fetch(`/api/regenerate-image-history?${params.toString()}`);
        
        if (!isMountedRef.current) return;
        
        if (response.ok) {
          const data = await response.json();
          setHistoryItems(data.history || []);
        }
      } catch (error) {
        if (!isMountedRef.current) return;
        
        console.error('히스토리 로드 실패:', error);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    if (open) {
      loadHistory();
    } else {
      // 다이얼로그가 닫힐 때 상태 초기화
      setHistoryItems([]);
      setLoading(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [open, visibilityFilter]);

  const handleImageClick = (item: HistoryItem) => {
    setViewerImageUrl(item.fileUrl);
    setViewerImageTitle(`생성된 이미지 - ${format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>생성된 이미지 조회</DialogTitle>
          </DialogHeader>

          {/* 상단 필터 토글 */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Button
                variant={visibilityFilter === 'public' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVisibilityFilter('public')}
                className="gap-1.5"
              >
                <Eye className="h-4 w-4" />
                퍼블릭
              </Button>
              <Button
                variant={visibilityFilter === 'private' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setVisibilityFilter('private')}
                className="gap-1.5"
                disabled={!profile?.id}
              >
                <EyeOff className="h-4 w-4" />
                프라이빗
              </Button>
            </div>
            {visibilityFilter === 'private' && (
              <span className="text-xs text-muted-foreground">내가 만든 비공개 이미지만 표시됩니다</span>
            )}
          </div>
          
          <ScrollArea className="flex-1 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : historyItems.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <p>생성된 이미지가 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {historyItems.map((item) => (
                  <div key={item.fileId} className="relative space-y-2">
                    <div 
                      className="relative w-full aspect-square bg-muted rounded-md overflow-hidden group cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => handleImageClick(item)}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center z-10">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                          <Search className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      {item.fileUrl && (
                        <Image
                          src={item.fileUrl}
                          alt="생성된 이미지"
                          fill
                          className="object-contain"
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                          unoptimized={true}
                          onError={(e) => {
                            console.error('[히스토리 이미지 로드 실패]', {
                              fileId: item.fileId,
                              fileUrl: item.fileUrl,
                            });
                          }}
                        />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm')}
                      </div>
                      {item.prompt && (
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {item.prompt}
                        </div>
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
    </>
  );
}

