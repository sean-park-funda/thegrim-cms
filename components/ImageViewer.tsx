'use client';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RefreshCw, X } from 'lucide-react';
import Image from 'next/image';
import { useImageViewer } from '@/lib/hooks/useImageViewer';

interface ImageViewerProps {
  imageUrl: string;
  imageName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageViewer({
  imageUrl,
  imageName,
  open,
  onOpenChange,
}: ImageViewerProps) {
  const {
    imageZoom,
    imagePosition,
    isDragging,
    setImageZoom,
    resetView,
    imageViewerRef,
    dragStart,
    setDragStart,
    setImagePosition,
    setIsDragging,
  } = useImageViewer({ enabled: open });

  const handleZoomIn = () => {
    setImageZoom(prev => Math.min(400, prev + 25));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(25, imageZoom - 25);
    setImageZoom(newZoom);
    if (newZoom <= 100) {
      setImagePosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (imageZoom > 100) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - imagePosition.x,
        y: e.clientY - imagePosition.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && imageZoom > 100) {
      const container = imageViewerRef.current;
      if (!container) return;

      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;

      const containerRect = container.getBoundingClientRect();
      const imgElement = container.querySelector('img');
      if (imgElement) {
        const imgRect = imgElement.getBoundingClientRect();
        const scaledWidth = imgRect.width;
        const scaledHeight = imgRect.height;

        let finalX = newX;
        let finalY = newY;

        if (scaledWidth > containerRect.width) {
          const maxX = (scaledWidth - containerRect.width) / 2;
          const minX = -maxX;
          finalX = Math.max(minX, Math.min(maxX, newX));
        } else {
          finalX = 0;
        }

        if (scaledHeight > containerRect.height) {
          const maxY = (scaledHeight - containerRect.height) / 2;
          const minY = -maxY;
          finalY = Math.max(minY, Math.min(maxY, newY));
        } else {
          finalY = 0;
        }

        setImagePosition({ x: finalX, y: finalY });
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (imageZoom > 100 && e.touches.length === 1) {
      // touch-action: none이 이미 설정되어 있어서 preventDefault 불필요
      // e.preventDefault(); // passive 이벤트 리스너에서는 호출 불가
      const touch = e.touches[0];
      setDragStart({
        x: touch.clientX - imagePosition.x,
        y: touch.clientY - imagePosition.y,
      });
      setIsDragging(true);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Touch drag started', { 
          zoom: imageZoom,
          touchPos: { x: touch.clientX, y: touch.clientY }
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && imageZoom > 100 && e.touches.length === 1) {
      // touch-action: none이 이미 설정되어 있어서 preventDefault 불필요
      // e.preventDefault(); // passive 이벤트 리스너에서는 호출 불가
      const container = imageViewerRef.current;
      if (!container) return;

      const touch = e.touches[0];
      const newX = touch.clientX - dragStart.x;
      const newY = touch.clientY - dragStart.y;

      const containerRect = container.getBoundingClientRect();
      const imgElement = container.querySelector('img');
      if (imgElement) {
        const imgRect = imgElement.getBoundingClientRect();
        const scaledWidth = imgRect.width;
        const scaledHeight = imgRect.height;

        let finalX = newX;
        let finalY = newY;

        if (scaledWidth > containerRect.width) {
          const maxX = (scaledWidth - containerRect.width) / 2;
          const minX = -maxX;
          finalX = Math.max(minX, Math.min(maxX, newX));
        } else {
          finalX = 0;
        }

        if (scaledHeight > containerRect.height) {
          const maxY = (scaledHeight - containerRect.height) / 2;
          const minY = -maxY;
          finalY = Math.max(minY, Math.min(maxY, newY));
        } else {
          finalY = 0;
        }

        setImagePosition({ x: finalX, y: finalY });
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ImageViewer] Touch drag move', { 
            position: { x: finalX, y: finalY },
            zoom: imageZoom
          });
        }
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[ImageViewer] Touch drag ended');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="!max-w-[100vw] !w-[100vw] !h-[100vh] !max-h-[100vh] !top-0 !left-0 !translate-x-0 !translate-y-0 !p-0 !border-0 !bg-black/95"
        style={{ touchAction: 'none' }}
      >
        <DialogTitle className="sr-only">이미지 전체화면 보기: {imageName}</DialogTitle>
        <div className="relative w-full h-full flex items-center justify-center">
          {/* 닫기 버튼 */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          {/* 줌 컨트롤 */}
          <div className="absolute top-4 left-4 z-50 flex gap-2">
            <Button
              variant="secondary"
              size="icon"
              onClick={handleZoomIn}
              disabled={imageZoom >= 400}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={handleZoomOut}
              disabled={imageZoom <= 25}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={resetView}
            >
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>

          {/* 이미지 컨테이너 */}
          <div
            ref={imageViewerRef}
            className="relative w-full h-full overflow-hidden cursor-move"
            style={{ touchAction: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transform: `translate(${imagePosition.x}px, ${imagePosition.y}px) scale(${imageZoom / 100})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                touchAction: 'none',
              }}
            >
              <Image
                src={imageUrl}
                alt={imageName}
                width={1920}
                height={1080}
                className="max-w-full max-h-full object-contain select-none"
                unoptimized={true}
                draggable={false}
              />
            </div>
          </div>

          {/* 줌 레벨 표시 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 bg-black/50 text-white px-4 py-2 rounded-md text-sm">
            {imageZoom}%
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

