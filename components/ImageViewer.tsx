'use client';

import { useRef } from 'react';
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

  // 핀치 줌을 위한 ref
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);

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
    if (e.touches.length === 2) {
      // 두 손가락: 핀치 줌 시작
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      pinchStartRef.current = {
        distance,
        zoom: imageZoom
      };
      setIsDragging(false);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Pinch zoom started', { 
          distance,
          zoom: imageZoom
        });
      }
    } else if (imageZoom > 100 && e.touches.length === 1) {
      // 한 손가락: 드래그 시작 (확대 상태에서만)
      const touch = e.touches[0];
      setDragStart({
        x: touch.clientX - imagePosition.x,
        y: touch.clientY - imagePosition.y,
      });
      setIsDragging(true);
      pinchStartRef.current = null;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Touch drag started', { 
          zoom: imageZoom,
          touchPos: { x: touch.clientX, y: touch.clientY }
        });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      // 두 손가락: 핀치 줌
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      const zoomChange = distance / pinchStartRef.current.distance;
      const newZoom = Math.max(25, Math.min(400, pinchStartRef.current.zoom * zoomChange));
      setImageZoom(newZoom);
      
      // 줌이 100% 이하로 내려가면 위치 초기화
      if (newZoom <= 100) {
        setImagePosition({ x: 0, y: 0 });
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Pinch zoom move', { 
          distance,
          zoom: newZoom,
          zoomChange
        });
      }
    } else if (isDragging && imageZoom > 100 && e.touches.length === 1) {
      // 한 손가락: 드래그 (확대 상태에서만)
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
    } else if (e.touches.length === 2 && !pinchStartRef.current) {
      // 핀치 줌이 아직 시작되지 않았지만 두 손가락이 감지된 경우 (즉시 시작)
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      pinchStartRef.current = {
        distance,
        zoom: imageZoom
      };
      setIsDragging(false);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Pinch zoom started in move', { 
          distance,
          zoom: imageZoom
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // 모든 손가락이 떼어짐
      setIsDragging(false);
      pinchStartRef.current = null;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] Touch ended');
      }
    } else if (e.touches.length === 1 && pinchStartRef.current) {
      // 핀치 줌 중 한 손가락만 남음 -> 드래그로 전환 (확대 상태에서만)
      pinchStartRef.current = null;
      if (imageZoom > 100) {
        const touch = e.touches[0];
        setDragStart({
          x: touch.clientX - imagePosition.x,
          y: touch.clientY - imagePosition.y,
        });
        setIsDragging(true);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ImageViewer] Pinch to drag transition', { zoom: imageZoom });
        }
      }
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

