'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Announcement, ContentBlock, markAnnouncementAsRead } from '@/lib/api/announcements';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

interface AnnouncementModalProps {
  announcements: Announcement[];
  userId: string;
  onClose: () => void;
  onAllRead: () => void;
}

export default function AnnouncementModal({
  announcements,
  userId,
  onClose,
  onAllRead,
}: AnnouncementModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [isMarkingRead, setIsMarkingRead] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  const currentAnnouncement = announcements[currentIndex];
  const hasNext = currentIndex < announcements.length - 1;
  const hasPrev = currentIndex > 0;
  const isLast = currentIndex === announcements.length - 1;

  // 현재 공지를 읽음 처리
  const handleMarkAsRead = useCallback(async () => {
    if (!currentAnnouncement || isMarkingRead) return;

    try {
      setIsMarkingRead(true);
      await markAnnouncementAsRead(userId, currentAnnouncement.id);
    } catch (error) {
      console.error('읽음 처리 오류:', error);
    } finally {
      setIsMarkingRead(false);
    }
  }, [currentAnnouncement, userId, isMarkingRead]);

  // 확인 버튼 클릭 (읽음 처리 후 다음으로 이동 또는 닫기)
  const handleConfirm = useCallback(async () => {
    await handleMarkAsRead();

    if (isLast) {
      // 마지막 공지였으면 모달 닫기
      setIsOpen(false);
      onAllRead();
      onClose();
    } else {
      // 다음 공지로 이동
      setCurrentIndex(prev => prev + 1);
    }
  }, [handleMarkAsRead, isLast, onAllRead, onClose]);

  // 이전 공지로 이동
  const handlePrev = useCallback(() => {
    if (hasPrev) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [hasPrev]);

  // 모달 닫기 (나중에 보기)
  const handleClose = useCallback(() => {
    setIsOpen(false);
    onClose();
  }, [onClose]);

  // 컨텐츠 블록 렌더링
  const renderContentBlock = (block: ContentBlock, index: number) => {
    if (block.type === 'text') {
      return (
        <p key={index} className="whitespace-pre-wrap text-base leading-relaxed">
          {block.value}
        </p>
      );
    } else if (block.type === 'image') {
      return (
        <div 
          key={index} 
          className="my-4 relative cursor-pointer group"
          onClick={() => setZoomedImageUrl(block.url)}
        >
          <img
            src={block.url}
            alt={`이미지 ${index + 1}`}
            className="w-full max-h-[500px] object-contain rounded-lg shadow-sm border bg-muted/30"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
            <ZoomIn className="h-10 w-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      );
    }
    return null;
  };

  if (!currentAnnouncement) {
    return null;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-[90vw] w-[900px] max-h-[90vh] h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="text-2xl font-bold">{currentAnnouncement.title}</DialogTitle>
              {announcements.length > 1 && (
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} / {announcements.length}
                </span>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(currentAnnouncement.created_at).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4 px-2">
              {currentAnnouncement.content.map((block, index) => renderContentBlock(block, index))}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 flex items-center justify-between gap-2 pt-4 border-t">
            <div className="flex items-center gap-2">
              {announcements.length > 1 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                    disabled={!hasPrev || isMarkingRead}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    이전
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {announcements.length - currentIndex - 1}개의 공지가 더 있습니다
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                나중에 보기
              </Button>
              <Button onClick={handleConfirm} disabled={isMarkingRead}>
                {isMarkingRead ? (
                  '처리 중...'
                ) : isLast ? (
                  '확인'
                ) : (
                  <>
                    다음
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 이미지 확대 다이얼로그 */}
      {zoomedImageUrl && (
        <Dialog open={true} onOpenChange={(open) => !open && setZoomedImageUrl(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] w-auto h-auto p-2">
            <DialogTitle className="sr-only">이미지 확대 보기</DialogTitle>
            <div className="relative flex items-center justify-center">
              <img
                src={zoomedImageUrl}
                alt="확대 이미지"
                className="max-w-[90vw] max-h-[90vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
