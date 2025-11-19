import { useEffect, useState, useRef } from 'react';

interface UseImageViewerOptions {
  enabled: boolean;
}

export function useImageViewer({ enabled }: UseImageViewerOptions) {
  const [imageZoom, setImageZoom] = useState(100);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [pinchStart, setPinchStart] = useState<{ distance: number; zoom: number } | null>(null);
  const [isPinching, setIsPinching] = useState(false);
  
  const imageViewerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isPinchingRef = useRef(false);
  const imageZoomRef = useRef(100);
  const imagePositionRef = useRef({ x: 0, y: 0 });

  // ref를 상태와 동기화
  useEffect(() => {
    touchStartRef.current = touchStart;
    pinchStartRef.current = pinchStart;
    isPinchingRef.current = isPinching;
    imageZoomRef.current = imageZoom;
    imagePositionRef.current = imagePosition;
  }, [touchStart, pinchStart, isPinching, imageZoom, imagePosition]);

  // 이미지 뷰어 터치 이벤트 핸들러 (non-passive)
  useEffect(() => {
    console.log('[ImageViewer] useEffect 실행', { 
      enabled,
      hasRef: !!imageViewerRef.current 
    });
    
    const container = imageViewerRef.current;
    if (!container || !enabled) {
      console.log('[ImageViewer] ❌ Event listeners not registered', { 
        hasContainer: !!container, 
        enabled,
        containerType: container?.tagName 
      });
      return;
    }
    
    console.log('[ImageViewer] ✅ Event listeners 등록 시작', { 
      container: container.tagName,
      containerId: container.id,
      containerClass: container.className,
      enabled 
    });

    const handleTouchStart = (e: TouchEvent) => {
      console.log('[ImageViewer] 🎯 Native TouchStart 이벤트 발생!', { 
        touches: e.touches.length, 
        target: (e.target as HTMLElement)?.tagName,
        currentTarget: (e.currentTarget as HTMLElement)?.tagName
      });
      
      const touches = e.touches;
      const currentZoom = imageZoomRef.current;
      
      console.log('[ImageViewer] TouchStart 처리', { 
        touches: touches.length, 
        zoom: currentZoom, 
        zoomRef: imageZoomRef.current,
        isZoomed: currentZoom > 100 
      });
      
      if (touches.length === 1) {
        // 한 손가락: 드래그 시작 (확대 상태에서만)
        if (currentZoom > 100) {
          e.preventDefault();
          e.stopPropagation();
          const touch = touches[0];
          const newTouchStart = {
            x: touch.clientX - imagePositionRef.current.x,
            y: touch.clientY - imagePositionRef.current.y
          };
          // ref를 먼저 업데이트 (동기적으로)
          touchStartRef.current = newTouchStart;
          isPinchingRef.current = false;
          setIsDragging(true);
          setIsPinching(false);
          // 상태 업데이트 (비동기)
          setTouchStart(newTouchStart);
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[ImageViewer] ✅ Touch drag started', { 
              zoom: currentZoom, 
              touchStart: newTouchStart,
              touchPos: { x: touch.clientX, y: touch.clientY },
              imagePos: imagePositionRef.current
            });
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ImageViewer] ⚠️ Touch ignored (zoom <= 100%)', { zoom: currentZoom });
          }
        }
        // 확대 상태가 아니면 preventDefault()를 호출하지 않아 기본 동작 허용
      } else if (touches.length === 2) {
        // 두 손가락: 핀치 줌 시작 (항상 preventDefault)
        e.preventDefault();
        e.stopPropagation();
        const touch1 = touches[0];
        const touch2 = touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const newPinchStart = {
          distance,
          zoom: imageZoomRef.current
        };
        // ref를 먼저 업데이트 (동기적으로)
        pinchStartRef.current = newPinchStart;
        isPinchingRef.current = true;
        // 상태 업데이트 (비동기)
        setPinchStart(newPinchStart);
        setIsPinching(true);
        setIsDragging(false);
        touchStartRef.current = null;
        setTouchStart(null);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ImageViewer] Pinch zoom started', { zoom: imageZoomRef.current, distance });
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touches = e.touches;
      
      // ref에서 최신 값 가져오기
      const currentTouchStart = touchStartRef.current;
      const currentPinchStart = pinchStartRef.current;
      const currentIsPinching = isPinchingRef.current;
      const currentZoom = imageZoomRef.current;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[ImageViewer] TouchMove', { 
          touches: touches.length, 
          zoom: currentZoom,
          hasTouchStart: !!currentTouchStart,
          isPinching: currentIsPinching
        });
      }
      
      // 확대 상태가 아니고 핀치 줌도 아닌 경우 기본 동작 허용
      if (touches.length === 1 && currentZoom <= 100 && !currentIsPinching) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[ImageViewer] ⚠️ TouchMove ignored (zoom <= 100%, not pinching)');
        }
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      if (touches.length === 2) {
        // 두 손가락: 핀치 줌 (우선 처리)
        if (currentPinchStart) {
          // 이미 핀치 줌이 시작된 경우
          const touch1 = touches[0];
          const touch2 = touches[1];
          const distance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
          );
          
          const zoomChange = distance / currentPinchStart.distance;
          const newZoom = Math.max(25, Math.min(400, currentPinchStart.zoom * zoomChange));
          imageZoomRef.current = newZoom;
          setImageZoom(newZoom);
          
          // 줌이 100% 이하로 내려가면 위치 초기화
          if (newZoom <= 100) {
            const zeroPosition = { x: 0, y: 0 };
            imagePositionRef.current = zeroPosition;
            setImagePosition(zeroPosition);
          }
        } else {
          // 핀치 줌이 아직 시작되지 않았지만 두 손가락이 감지된 경우 (즉시 시작)
          const touch1 = touches[0];
          const touch2 = touches[1];
          const distance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
          );
          const newPinchStart = {
            distance,
            zoom: currentZoom
          };
          pinchStartRef.current = newPinchStart;
          isPinchingRef.current = true;
          setPinchStart(newPinchStart);
          setIsPinching(true);
          setIsDragging(false);
          touchStartRef.current = null;
          setTouchStart(null);
        }
      } else if (touches.length === 1) {
        // 한 손가락: 드래그 (확대 상태에서만)
        if (currentZoom > 100) {
          if (currentTouchStart && !currentIsPinching) {
            // 드래그 진행 중
            const touch = touches[0];
            const newX = touch.clientX - currentTouchStart.x;
            const newY = touch.clientY - currentTouchStart.y;
          
            // 이미지 크기와 컨테이너 크기를 고려한 제한
            const containerRect = container.getBoundingClientRect();
            const imgElement = container.querySelector('img');
            if (imgElement) {
              const imgRect = imgElement.getBoundingClientRect();
              const scaledWidth = imgRect.width;
              const scaledHeight = imgRect.height;
              
              let finalX = newX;
              let finalY = newY;
              
              // 이미지가 컨테이너보다 크면 드래그 가능
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
              
              const newPosition = { x: finalX, y: finalY };
              imagePositionRef.current = newPosition;
              setImagePosition(newPosition);
              
              if (process.env.NODE_ENV === 'development') {
                console.log('[ImageViewer] ✅ Touch drag move', { 
                  position: newPosition, 
                  zoom: currentZoom,
                  raw: { x: newX, y: newY },
                  touch: { x: touch.clientX, y: touch.clientY }
                });
              }
            } else {
              if (process.env.NODE_ENV === 'development') {
                console.log('[ImageViewer] ❌ No img element found');
              }
            }
          } else if (!currentTouchStart && !currentIsPinching) {
            // touchStart가 없으면 즉시 설정 (드래그 시작)
            const touch = touches[0];
            const newTouchStart = {
              x: touch.clientX - imagePositionRef.current.x,
              y: touch.clientY - imagePositionRef.current.y
            };
            touchStartRef.current = newTouchStart;
            setTouchStart(newTouchStart);
            setIsDragging(true);
            isPinchingRef.current = false;
            setIsPinching(false);
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[ImageViewer] ✅ Touch drag started in move', { 
                zoom: currentZoom, 
                touchStart: newTouchStart,
                touchPos: { x: touch.clientX, y: touch.clientY }
              });
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ImageViewer] ⚠️ TouchMove: Cannot drag', { 
                hasTouchStart: !!currentTouchStart, 
                isPinching: currentIsPinching 
              });
            }
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ImageViewer] ⚠️ TouchMove: Zoom <= 100%', { zoom: currentZoom });
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touches = e.touches;
      const currentIsPinching = isPinchingRef.current;
      const currentZoom = imageZoomRef.current;
      
      // 확대 상태가 아니고 핀치 줌도 아닌 경우 기본 동작 허용
      if (touches.length === 0 && currentZoom <= 100 && !currentIsPinching) {
        return;
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      if (touches.length === 0) {
        // 모든 손가락이 떼어짐
        setIsDragging(false);
        setIsPinching(false);
        isPinchingRef.current = false;
        touchStartRef.current = null;
        pinchStartRef.current = null;
        setTouchStart(null);
        setPinchStart(null);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[ImageViewer] Touch end');
        }
      } else if (touches.length === 1 && currentIsPinching) {
        // 핀치 줌 중 한 손가락만 남음 -> 드래그로 전환
        setIsPinching(false);
        isPinchingRef.current = false;
        pinchStartRef.current = null;
        setPinchStart(null);
        const touch = touches[0];
        if (currentZoom > 100) {
          const newTouchStart = {
            x: touch.clientX - imagePositionRef.current.x,
            y: touch.clientY - imagePositionRef.current.y
          };
          touchStartRef.current = newTouchStart;
          setTouchStart(newTouchStart);
          setIsDragging(true);
        }
      }
    };

    // non-passive 이벤트 리스너 등록
    console.log('[ImageViewer] addEventListener 호출 전');
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    console.log('[ImageViewer] ✅ addEventListener 완료 - 이제 터치 이벤트를 기다립니다');

    return () => {
      console.log('[ImageViewer] cleanup - 이벤트 리스너 제거');
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled]);

  const resetView = () => {
    setImageZoom(100);
    setImagePosition({ x: 0, y: 0 });
    setIsDragging(false);
    setIsPinching(false);
    setTouchStart(null);
    setPinchStart(null);
    imageZoomRef.current = 100;
    imagePositionRef.current = { x: 0, y: 0 };
    touchStartRef.current = null;
    pinchStartRef.current = null;
    isPinchingRef.current = false;
  };

  return {
    imageZoom,
    imagePosition,
    isDragging,
    isPinching,
    setImageZoom,
    setImagePosition,
    setIsDragging,
    resetView,
    imageViewerRef,
    dragStart,
    setDragStart,
  };
}

