'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw } from 'lucide-react';
import { ShortstoonViewport, ShortstoonEffectType } from '@/lib/supabase';

interface ViewportEditorProps {
  imageUrl: string;
  viewport: ShortstoonViewport;
  onChange: (viewport: ShortstoonViewport) => void;
  effectType: ShortstoonEffectType;
  effectParams: Record<string, unknown>;
  durationMs: number;
}

const CANVAS_W = 432;
const CANVAS_H = 768;

export function ViewportEditor({
  imageUrl, viewport, onChange, effectType, effectParams, durationMs,
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

  useEffect(() => {
    imgLoadedRef.current = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { imgRef.current = img; imgLoadedRef.current = true; drawStatic(); };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => { if (!playing) drawStatic(); }, [viewport, effectType, effectParams, durationMs]);

  const drawStatic = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoadedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { drawX, drawY, drawW, drawH } = computeDraw(img.naturalWidth, img.naturalHeight, viewportRef.current, 0, effectType, effectParams, durationMs);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }, [effectType, effectParams, durationMs]);

  const startAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    playStartRef.current = performance.now();
    const loop = (now: number) => {
      const t = Math.min((now - playStartRef.current) / durationMs, 1);
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { drawX, drawY, drawW, drawH } = computeDraw(img.naturalWidth, img.naturalHeight, viewportRef.current, t, effectType, effectParams, durationMs);
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      if (t < 1) animFrameRef.current = requestAnimationFrame(loop);
      else { setPlaying(false); drawStatic(); }
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [effectType, effectParams, durationMs, drawStatic]);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setPlaying(false);
    drawStatic();
  }, [drawStatic]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (playing) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOX: viewport.offset_x, startOY: viewport.offset_y };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !imgRef.current) return;
    const img = imgRef.current;
    const vp = viewportRef.current;
    const coverScale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
    const actualScale = coverScale * vp.scale;
    const maxOffX = Math.max(0, img.naturalWidth * actualScale - CANVAS_W);
    const maxOffY = Math.max(0, img.naturalHeight * actualScale - CANVAS_H);
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onChange({
      ...vp,
      offset_x: maxOffX > 0 ? Math.max(0, Math.min(1, dragRef.current.startOX - dx / maxOffX)) : 0.5,
      offset_y: maxOffY > 0 ? Math.max(0, Math.min(1, dragRef.current.startOY - dy / maxOffY)) : 0.5,
    });
  }, [onChange]);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => () => { cancelAnimationFrame(animFrameRef.current); }, []);

  return (
    <div className="flex flex-col gap-2" style={{ width: CANVAS_W }}>
      {/* 캔버스 */}
      <div className="relative rounded-lg overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseDown={handleMouseDown}
          className="block cursor-grab active:cursor-grabbing bg-black"
        />
        <div className="absolute inset-0 rounded-lg ring-1 ring-white/10 pointer-events-none" />
      </div>

      {/* 배율 슬라이더 (라벨 없음, 값만 표시) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-8 text-right flex-shrink-0">
          {viewport.scale.toFixed(1)}x
        </span>
        <Slider
          min={10} max={50} step={1}
          value={[Math.round(viewport.scale * 10)]}
          onValueChange={([v]) => onChange({ ...viewport, scale: v / 10 })}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-8 flex-shrink-0">5.0x</span>
      </div>

      {/* 초기화 + 미리보기 */}
      <div className="flex gap-2">
        <Button
          variant="outline" size="sm"
          className="flex-1 text-xs h-7 gap-1"
          onClick={() => onChange({ scale: 1.0, offset_x: 0.5, offset_y: 0.5 })}
        >
          <RotateCcw className="h-3 w-3" />
          초기화
        </Button>
        {effectType !== 'none' && (
          <Button
            variant={playing ? 'destructive' : 'secondary'} size="sm"
            className="flex-1 text-xs h-7 gap-1"
            onClick={() => playing ? stopAnimation() : (setPlaying(true), startAnimation())}
          >
            {playing ? <><Square className="h-3 w-3" />중지</> : <><Play className="h-3 w-3" />미리보기</>}
          </Button>
        )}
      </div>
    </div>
  );
}

function computeDraw(
  imgW: number, imgH: number, vp: ShortstoonViewport,
  t: number, effect: ShortstoonEffectType, params: Record<string, unknown>, durationMs: number,
) {
  const coverScale = Math.max(CANVAS_W / imgW, CANVAS_H / imgH);
  let actualScale = coverScale * vp.scale;
  const sw = () => imgW * actualScale;
  const sh = () => imgH * actualScale;
  const bx = () => -(sw() - CANVAS_W) * vp.offset_x;
  const by = () => -(sh() - CANVAS_H) * vp.offset_y;

  let drawX = bx(), drawY = by(), drawW = sw(), drawH = sh();

  if (effect === 'scroll_h') {
    const dir = (params.direction as string) === 'right' ? -1 : 1;
    drawX = bx() + dir * t * Math.max(CANVAS_W, sw() - CANVAS_W);
  } else if (effect === 'scroll_v') {
    const dir = (params.direction as string) === 'down' ? -1 : 1;
    drawY = by() + dir * t * Math.max(CANVAS_H, sh() - CANVAS_H);
  } else if (effect === 'zoom_in' || effect === 'zoom_out') {
    const from = (params.from as number) ?? (effect === 'zoom_in' ? 1.0 : 1.3);
    const to   = (params.to   as number) ?? (effect === 'zoom_in' ? 1.3 : 1.0);
    actualScale = coverScale * vp.scale * (from + (to - from) * t);
    drawW = imgW * actualScale; drawH = imgH * actualScale;
    drawX = -(drawW - CANVAS_W) * vp.offset_x;
    drawY = -(drawH - CANVAS_H) * vp.offset_y;
  } else if (effect === 'shake') {
    const amp = (params.amplitude as number) ?? 8;
    const freq = (params.frequency as number) ?? 8;
    const elapsed = t * (durationMs / 1000);
    drawX = bx() + amp * Math.sin(2 * Math.PI * freq * elapsed);
    drawY = by() + amp * Math.sin(2 * Math.PI * freq * elapsed + Math.PI / 3);
  }

  return { drawX, drawY, drawW, drawH };
}
