'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import { Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ImageViewer } from './ImageViewer';

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
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewerImageUrl, setViewerImageUrl] = useState<string | null>(null);
  const [viewerImageTitle, setViewerImageTitle] = useState<string>('');

  useEffect(() => {
    const loadHistory = async () => {
      if (open && !loading) {
        setLoading(true);
        try {
          const response = await fetch('/api/regenerate-image-history?limit=100');
          if (response.ok) {
            const data = await response.json();
            setHistoryItems(data.history || []);
          }
        } catch (error) {
          console.error('히스토리 로드 실패:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

