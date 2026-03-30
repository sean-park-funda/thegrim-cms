'use client';

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { ShortstoonViewport, ShortstoonEffectType } from '@/lib/supabase';

interface ViewportEditorProps {
  imageUrl: string;
  viewport: ShortstoonViewport;
  onChange: (viewport: ShortstoonViewport) => void;
  effectType: ShortstoonEffectType;
  effectParams: Record<string, unknown>;
  durationMs: number;
}

export interface ViewportEditorHandle {
  togglePlay: () => void;
  playing: boolean;
}

const CANVAS_W = 432;
const CANVAS_H = 768;

export const ViewportEditor = forwardRef<ViewportEditorHandle, ViewportEditorProps>(function ViewportEditor(
  { imageUrl, viewport, onChange, effectType, effectParams, durationMs },
  ref
) {
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
      else setPlaying(false);
    };
    animFrameRef.current = requestAnimationFrame(loop);
  }, [effectType, effectParams, durationMs, drawStatic]);

  const stopAnimation = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setPlaying(false);
    drawStatic();
  }, [drawStatic]);

  const togglePlay = useCallback(() => {
    if (playing) stopAnimation();
    else { setPlaying(true); startAnimation(); }
  }, [playing, startAnimation, stopAnimation]);

  useImperativeHandle(ref, () => ({ togglePlay, playing }), [togglePlay, playing]);

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.min(5.0, Math.max(1.0, viewportRef.current.scale + delta));
    onChange({ ...viewportRef.current, scale: Math.round(next * 10) / 10 });
  }, [onChange]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  useEffect(() => () => { cancelAnimationFrame(animFrameRef.current); }, []);

  return (
    <div style={{ width: CANVAS_W }}>
      <div className="relative rounded-lg overflow-hidden" style={{ width: CANVAS_W, height: CANVAS_H }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          className="block cursor-grab active:cursor-grabbing bg-black"
        />
        <div className="absolute inset-0 rounded-lg ring-1 ring-white/10 pointer-events-none" />
        <div className="absolute top-2 right-2 bg-black/50 text-white/60 text-[11px] px-1.5 py-0.5 rounded pointer-events-none">
          {viewport.scale.toFixed(1)}×
        </div>
      </div>
    </div>
  );
});

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

  // ease-out: 시작 등속, 끝 감속 (quadratic ease-out)
  const et = 2 * t - t * t;

  if (effect === 'scroll_h') {
    const dir = (params.direction as string) === 'right' ? 1 : -1;
    const amount = (params.amount as number) ?? 0.5;
    drawX = bx() + dir * et * Math.max(CANVAS_W, sw() - CANVAS_W) * amount;
  } else if (effect === 'scroll_v') {
    const dir = (params.direction as string) === 'down' ? 1 : -1;
    const amount = (params.amount as number) ?? 0.5;
    drawY = by() + dir * et * Math.max(CANVAS_H, sh() - CANVAS_H) * amount;
  } else if (effect === 'zoom_in' || effect === 'zoom_out') {
    const delta = (params.delta as number) ?? 0.3;
    const factor = effect === 'zoom_in' ? (1.0 + delta * et) : (1.0 + delta * (1 - et));
    actualScale = coverScale * vp.scale * factor;
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
