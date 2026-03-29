'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Play, Square } from 'lucide-react';
import {
  ShortstoonViewport,
  ShortstoonEffectType,
} from '@/lib/supabase';

interface ViewportEditorProps {
  imageUrl: string;
  viewport: ShortstoonViewport;
  onChange: (viewport: ShortstoonViewport) => void;
  effectType: ShortstoonEffectType;
  effectParams: Record<string, unknown>;
  durationMs: number;
}

// 캔버스 표시 크기 (9:16)
const CANVAS_W = 216;
const CANVAS_H = 384;

export function ViewportEditor({
  imageUrl,
  viewport,
  onChange,
  effectType,
  effectParams,
  durationMs,
}: ViewportEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoadedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; startOX: number; startOY: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const [playing, setPlaying] = useState(false);
  const playStartRef = useRef<number>(0);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  // 이미지 로드
  useEffect(() => {
    imgLoadedRef.current = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      imgLoadedRef.current = true;
      drawStatic();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // viewport 변경 시 정적 재드로
  useEffect(() => {
    if (!playing) drawStatic();
  }, [viewport, effectType, effectParams, durationMs]);

  // 정적 드로: 현재 viewport 기준으로 캔버스에 그림
  const drawStatic = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoadedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vp = viewportRef.current;
    const { drawX, drawY, drawW, drawH } = computeDraw(img.naturalWidth, img.naturalHeight, vp, 0, effectType, effectParams, durationMs);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, [effectType, effectParams, durationMs]);

  // 애니메이션 루프
  const startAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    playStartRef.current = performance.now();

    const loop = (now: number) => {
      const elapsed = (now - playStartRef.current) / 1000; // 초
      const t = Math.min(elapsed / (durationMs / 1000), 1);

      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vp = viewportRef.current;
      const { drawX, drawY, drawW, drawH } = computeDraw(img.naturalWidth, img.naturalHeight, vp, t, effectType, effectParams, durationMs);

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        setPlaying(false);
        drawStatic();
      }
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [effectType, effectParams, durationMs, drawStatic]);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setPlaying(false);
    drawStatic();
  }, [drawStatic]);

  const handlePlayToggle = () => {
    if (playing) {
      stopAnimation();
    } else {
      setPlaying(true);
      startAnimation();
    }
  };

  // 드래그로 offset_x/y 조정
  const handleMouseDown = (e: React.MouseEvent) => {
    if (playing) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOX: viewport.offset_x,
      startOY: viewport.offset_y,
    };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const vp = viewportRef.current;

    const coverScale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
    const actualScale = coverScale * vp.scale;
    const scaledW = img.naturalWidth * actualScale;
    const scaledH = img.naturalHeight * actualScale;

    const maxOffX = Math.max(0, scaledW - CANVAS_W);
    const maxOffY = Math.max(0, scaledH - CANVAS_H);

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    // 드래그 방향 반대로 (이미지를 민다는 느낌)
    const newOX = maxOffX > 0
      ? Math.max(0, Math.min(1, dragRef.current.startOX - dx / maxOffX))
      : 0.5;
    const newOY = maxOffY > 0
      ? Math.max(0, Math.min(1, dragRef.current.startOY - dy / maxOffY))
      : 0.5;

    onChange({ ...vp, offset_x: newOX, offset_y: newOY });
  }, [onChange]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // cleanup
  useEffect(() => () => { cancelAnimationFrame(animFrameRef.current); }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 캔버스 */}
      <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseDown={handleMouseDown}
          className="rounded border border-border cursor-grab active:cursor-grabbing bg-black"
          style={{ display: 'block' }}
        />
        {/* 9:16 테두리 표시 */}
        <div className="absolute inset-0 rounded border-2 border-primary/30 pointer-events-none" />
      </div>

      {/* 배율 슬라이더 */}
      <div className="w-full space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>배율</span>
          <span>{viewport.scale.toFixed(1)}x</span>
        </div>
        <Slider
          min={10}
          max={50}
          step={1}
          value={[Math.round(viewport.scale * 10)]}
          onValueChange={([v]) => onChange({ ...viewport, scale: v / 10 })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1.0x (커버)</span>
          <span>5.0x</span>
        </div>
      </div>

      {/* 중앙 초기화 + 미리보기 */}
      <div className="flex gap-2 w-full">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onChange({ scale: 1.0, offset_x: 0.5, offset_y: 0.5 })}
        >
          중앙 초기화
        </Button>
        {effectType !== 'none' && (
          <Button
            variant={playing ? 'destructive' : 'secondary'}
            size="sm"
            className="flex-1 text-xs"
            onClick={handlePlayToggle}
          >
            {playing ? (
              <><Square className="h-3 w-3 mr-1" />중지</>
            ) : (
              <><Play className="h-3 w-3 mr-1" />미리보기</>
            )}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        이미지를 드래그해서 위치를 조정하세요
      </p>
    </div>
  );
}

// t: 0~1 (0=시작, 1=끝)
function computeDraw(
  imgW: number,
  imgH: number,
  vp: ShortstoonViewport,
  t: number,
  effect: ShortstoonEffectType,
  params: Record<string, unknown>,
  durationMs: number,
) {
  const coverScale = Math.max(CANVAS_W / imgW, CANVAS_H / imgH);
  let actualScale = coverScale * vp.scale;

  const scaledW = () => imgW * actualScale;
  const scaledH = () => imgH * actualScale;

  const baseOffX = () => -(scaledW() - CANVAS_W) * vp.offset_x;
  const baseOffY = () => -(scaledH() - CANVAS_H) * vp.offset_y;

  let drawX = baseOffX();
  let drawY = baseOffY();
  let drawW = scaledW();
  let drawH = scaledH();

  if (effect === 'scroll_h') {
    const dir = (params.direction as string) === 'right' ? -1 : 1;
    const range = Math.max(CANVAS_W, scaledW() - CANVAS_W);
    drawX = baseOffX() + dir * t * range;
  } else if (effect === 'scroll_v') {
    const dir = (params.direction as string) === 'down' ? -1 : 1;
    const range = Math.max(CANVAS_H, scaledH() - CANVAS_H);
    drawY = baseOffY() + dir * t * range;
  } else if (effect === 'zoom_in') {
    const from = (params.from as number) ?? 1.0;
    const to = (params.to as number) ?? 1.3;
    actualScale = coverScale * vp.scale * (from + (to - from) * t);
    drawW = imgW * actualScale;
    drawH = imgH * actualScale;
    drawX = -(drawW - CANVAS_W) * vp.offset_x;
    drawY = -(drawH - CANVAS_H) * vp.offset_y;
  } else if (effect === 'zoom_out') {
    const from = (params.from as number) ?? 1.3;
    const to = (params.to as number) ?? 1.0;
    actualScale = coverScale * vp.scale * (from + (to - from) * t);
    drawW = imgW * actualScale;
    drawH = imgH * actualScale;
    drawX = -(drawW - CANVAS_W) * vp.offset_x;
    drawY = -(drawH - CANVAS_H) * vp.offset_y;
  } else if (effect === 'shake') {
    const amplitude = (params.amplitude as number) ?? 8;
    const frequency = (params.frequency as number) ?? 8;
    const elapsed = t * (durationMs / 1000);
    drawX = baseOffX() + amplitude * Math.sin(2 * Math.PI * frequency * elapsed);
    drawY = baseOffY() + amplitude * Math.sin(2 * Math.PI * frequency * elapsed + Math.PI / 3);
  }
  // flash는 Canvas globalAlpha로 처리하기 어려우므로 static만 보여줌

  return { drawX, drawY, drawW, drawH };
}
