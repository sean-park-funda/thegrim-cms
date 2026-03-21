'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Film, Loader2, Download, Check, GripVertical, Save } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { WebtoonAnimationProject } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type TransitionType = 'cut' | 'fade' | 'dissolve' | 'wipe_left' | 'delay';
interface TransitionConfig { type: TransitionType; duration: number; }
interface TimelineItem {
  id: string;
  cutIndex: number;
  videoUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  transition: TransitionConfig;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: string; defaultDur: number }[] = [
  { type: 'cut',       label: '컷',     icon: '✂',  defaultDur: 0   },
  { type: 'fade',      label: '페이드', icon: '◐',  defaultDur: 0.5 },
  { type: 'dissolve',  label: '디졸브', icon: '◑',  defaultDur: 0.5 },
  { type: 'wipe_left', label: '와이프', icon: '→',  defaultDur: 0.5 },
  { type: 'delay',     label: '딜레이', icon: '⏸', defaultDur: 1.0 },
];

function fmt(sec: number) {
  return sec < 60 ? `${sec.toFixed(1)}s` : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.src = url;
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration || 7);
    v.onerror = () => resolve(7);
  });
}

// ─── Trim Range Bar ───────────────────────────────────────────────────────────

function TrimRangeBar({
  dur, trimStart, trimEnd, onChange, onSeek,
}: {
  dur: number;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
  onSeek: (t: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const leftPct  = (trimStart / dur) * 100;
  const rightPct = ((dur - trimEnd) / dur) * 100;

  const getTime = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - rect.left) / rect.width) * dur));
  };

  const startDrag = (which: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const onMove = (me: MouseEvent) => {
      const t = getTime(me.clientX);
      if (which === 'start') {
        const s = Math.max(0, Math.min(t, dur - trimEnd - 0.2));
        onChange(s, trimEnd);
        onSeek(s);
      } else {
        const en = Math.max(0, Math.min(dur - t, dur - trimStart - 0.2));
        onChange(trimStart, en);
        onSeek(Math.max(0, dur - en - 0.05));
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div ref={barRef} className="relative h-8 rounded select-none bg-muted/60">
      {/* 트림 제외 영역 */}
      <div className="absolute left-0 top-0 h-full bg-zinc-800/70 rounded-l pointer-events-none"
        style={{ width: `${leftPct}%` }} />
      <div className="absolute right-0 top-0 h-full bg-zinc-800/70 rounded-r pointer-events-none"
        style={{ width: `${100 - rightPct}%` }} />
      {/* 유효 구간 */}
      <div className="absolute top-0 h-full bg-primary/20 border-y border-primary/40 pointer-events-none"
        style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }} />
      {/* 왼쪽 핸들 */}
      <div
        className="absolute top-0 h-full w-4 bg-primary cursor-ew-resize flex items-center justify-center z-10 shadow rounded-l"
        style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
        onMouseDown={startDrag('start')}
      >
        <div className="flex gap-px"><div className="w-px h-4 bg-white/70" /><div className="w-px h-4 bg-white/70" /></div>
      </div>
      {/* 오른쪽 핸들 */}
      <div
        className="absolute top-0 h-full w-4 bg-primary cursor-ew-resize flex items-center justify-center z-10 shadow rounded-r"
        style={{ left: `${rightPct}%`, transform: 'translateX(-50%)' }}
        onMouseDown={startDrag('end')}
      >
        <div className="flex gap-px"><div className="w-px h-4 bg-white/70" /><div className="w-px h-4 bg-white/70" /></div>
      </div>
    </div>
  );
}

// ─── Transition Editor ────────────────────────────────────────────────────────

function TransitionEditor({ config, onChange }: { config: TransitionConfig; onChange: (c: TransitionConfig) => void }) {
  const [open, setOpen] = useState(false);
  const opt = TRANSITION_OPTIONS.find((o) => o.type === config.type)!;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 relative self-start mt-16">
      <div className="flex items-center">
        <div className="w-4 h-0.5 bg-border" />
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'w-8 h-8 rounded-full border-2 text-sm transition-colors flex items-center justify-center',
            open ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-muted-foreground'
          )}
        >{opt.icon}</button>
        <div className="w-4 h-0.5 bg-border" />
      </div>
      {config.type !== 'cut' && (
        <span className="text-[10px] text-muted-foreground">{fmt(config.duration)}</span>
      )}
      {open && (
        <div className="absolute top-full mt-2 z-30 bg-popover border rounded-lg shadow-lg p-3 w-52 space-y-3">
          <div className="grid grid-cols-5 gap-1">
            {TRANSITION_OPTIONS.map((o) => (
              <button key={o.type}
                onClick={() => onChange({ type: o.type, duration: o.type === 'cut' ? 0 : (config.duration || o.defaultDur) })}
                className={cn(
                  'flex flex-col items-center py-1.5 rounded border text-base transition-colors',
                  config.type === o.type ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                )}
              >
                {o.icon}
                <span className="text-[9px] text-muted-foreground mt-0.5">{o.label}</span>
              </button>
            ))}
          </div>
          {config.type !== 'cut' && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">
                {config.type === 'delay' ? '딜레이' : '길이'}
              </Label>
              <Input type="number" min={0.1} max={5} step={0.1}
                value={config.duration}
                onChange={(e) => onChange({ ...config, duration: parseFloat(e.target.value) || 0.5 })}
                className="h-7 text-xs w-20"
              />
              <span className="text-xs text-muted-foreground">초</span>
            </div>
          )}
          <button className="absolute top-1.5 right-2 text-muted-foreground hover:text-foreground text-xs"
            onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Cut Card (트림 인라인) ──────────────────────────────────────────

function SortableCutCard({
  item, onTrimChange, onTransitionChange, isLast,
}: {
  item: TimelineItem;
  onTrimChange: (id: string, trimStart: number, trimEnd: number) => void;
  onTransitionChange: (id: string, t: TransitionConfig) => void;
  isLast: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const effectiveDur = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
  const hasTrim = item.trimStart > 0.05 || item.trimEnd > 0.05;

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  return (
    <div className="flex items-start" ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>

      <div className="w-60 shrink-0">
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* 헤더 */}
          <div className="px-2 py-1.5 bg-muted/30 border-b flex items-center gap-1.5">
            <button {...attributes} {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold">CUT {item.cutIndex + 1}</span>
            <span className={cn('text-[10px] ml-auto font-mono', hasTrim ? 'text-amber-400' : 'text-muted-foreground')}>
              {fmt(effectiveDur)}
            </span>
          </div>

          {/* 영상 (seek용) */}
          <video
            ref={videoRef}
            src={item.videoUrl}
            className="w-full aspect-video bg-black"
            preload="metadata"
          />

          {/* 트림 바 (인라인) */}
          <div className="px-3 py-2 space-y-1.5">
            <TrimRangeBar
              dur={item.originalDuration}
              trimStart={item.trimStart}
              trimEnd={item.trimEnd}
              onChange={(s, e) => onTrimChange(item.id, s, e)}
              onSeek={seek}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
              <span className="font-mono">{fmt(item.trimStart)}</span>
              <span className={cn('font-mono font-medium', hasTrim ? 'text-amber-400' : 'text-foreground')}>
                ▶ {fmt(effectiveDur)}
              </span>
              <span className="font-mono">{fmt(item.trimEnd)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 트랜지션 */}
      {!isLast && (
        <TransitionEditor
          config={item.transition}
          onChange={(t) => onTransitionChange(item.id, t)}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function TimelinePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');

  const [project, setProject] = useState<WebtoonAnimationProject | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoad = useRef(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: proj }, { data: cutsData }] = await Promise.all([
        supabase.from('webtoonanimation_projects').select('*').eq('id', projectId).single(),
        supabase.from('webtoonanimation_cuts').select('*').eq('project_id', projectId).order('order_index'),
      ]);
      if (proj) setProject(proj);
      if (cutsData) {
        const withVideo = cutsData.filter((c) => c.comfyui_video_url);
        // 저장된 config 불러오기
        const savedConfig = proj?.timeline_config as WebtoonAnimationProject['timeline_config'];
        const savedOrder: string[] = savedConfig?.order ?? [];
        const savedItems = savedConfig?.items ?? {};

        const resolved: TimelineItem[] = await Promise.all(
          withVideo.map(async (c) => {
            const dur = await getVideoDuration(c.comfyui_video_url!);
            const saved = savedItems[c.id];
            return {
              id: c.id, cutIndex: c.order_index,
              videoUrl: c.comfyui_video_url!,
              originalDuration: dur,
              trimStart: saved?.trimStart ?? 0,
              trimEnd: saved?.trimEnd ?? 0,
              transition: (saved?.transition as TransitionConfig) ?? { type: 'cut', duration: 0 },
            };
          })
        );

        // 저장된 순서 적용 (새로 추가된 컷은 뒤에 붙임)
        if (savedOrder.length > 0) {
          const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]));
          resolved.sort((a, b) => {
            const ia = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
            const ib = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
            return ia - ib;
          });
        }
        setItems(resolved);
      }
      setLoading(false);
      // 초기 로드 완료 — 이후 변경부터 자동저장
      setTimeout(() => { isInitialLoad.current = false; }, 100);
    })();
  }, [projectId]);

  // 자동저장 (debounce 1.5초)
  useEffect(() => {
    if (isInitialLoad.current || !projectId || items.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus('saving');
    saveTimerRef.current = setTimeout(async () => {
      const config = {
        order: items.map((i) => i.id),
        items: Object.fromEntries(
          items.map((i) => [i.id, { trimStart: i.trimStart, trimEnd: i.trimEnd, transition: i.transition }])
        ),
      };
      await supabase
        .from('webtoonanimation_projects')
        .update({ timeline_config: config })
        .eq('id', projectId);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 1500);
  }, [items, projectId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const handleTrimChange = useCallback((id: string, trimStart: number, trimEnd: number) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, trimStart, trimEnd } : i));
  }, []);

  const handleTransitionChange = useCallback((id: string, t: TransitionConfig) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, transition: t } : i));
  }, []);

  const totalDuration = items.reduce((acc, item, idx) => {
    const eff = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
    if (idx === items.length - 1) return acc + eff;
    const t = item.transition;
    if (t.type === 'delay') return acc + eff + t.duration;
    if (t.type === 'cut') return acc + eff;
    return acc + eff - t.duration;
  }, 0);

  const handleRender = async () => {
    if (items.length < 1) return;
    setRendering(true);
    setRenderResult(null);
    try {
      const res = await fetch('/api/webtoonanimation/render-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          items: items.map((item) => ({
            cutId: item.id, videoUrl: item.videoUrl,
            originalDuration: item.originalDuration,
            trimStart: item.trimStart, trimEnd: item.trimEnd,
            transition: item.transition,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.polling) {
        const startTime = Date.now();
        while (Date.now() - startTime < 10 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 8000));
          const { data: proj } = await supabase
            .from('webtoonanimation_projects').select('timeline_rendered_url')
            .eq('id', projectId).single();
          if (proj?.timeline_rendered_url) { setRenderResult(proj.timeline_rendered_url); return; }
        }
        throw new Error('렌더링 타임아웃 (10분)');
      } else if (data.url) {
        setRenderResult(data.url);
      }
    } catch (e) {
      alert(`렌더링 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRendering(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />뒤로
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">{project?.title ?? '프로젝트'} — 타임라인 편집</h1>
          <p className="text-[11px] text-muted-foreground">
            {items.length}개 클립 · 총 <span className="font-mono text-foreground">{fmt(totalDuration)}</span>
          </p>
        </div>
        {saveStatus !== 'idle' && (
          <span className="text-[11px] flex items-center gap-1 text-muted-foreground">
            {saveStatus === 'saving'
              ? <><Loader2 className="h-3 w-3 animate-spin" />저장 중...</>
              : <><Check className="h-3 w-3 text-green-500" />저장됨</>}
          </span>
        )}
        <Button onClick={handleRender} disabled={rendering || items.length < 1} className="gap-1.5">
          {rendering
            ? <><Loader2 className="h-4 w-4 animate-spin" />렌더링 중...</>
            : <><Film className="h-4 w-4" />렌더링 시작</>}
        </Button>
      </div>

      {/* 타임라인 */}
      <div className="flex-1 overflow-x-auto p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Film className="h-8 w-8 opacity-30" />
            <p className="text-sm">영상이 생성된 컷이 없습니다</p>
            <p className="text-xs opacity-70">5090 탭에서 영상을 먼저 생성해주세요</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex items-start gap-0 min-w-max pb-4">
                {items.map((item, idx) => (
                  <SortableCutCard
                    key={item.id}
                    item={item}
                    isLast={idx === items.length - 1}
                    onTrimChange={handleTrimChange}
                    onTransitionChange={handleTransitionChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 전체 타임라인 바 */}
      {items.length > 0 && (
        <div className="border-t px-6 py-3">
          <div className="flex h-5 rounded overflow-hidden gap-px">
            {items.map((item) => {
              const eff = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
              const pct = (eff / totalDuration) * 100;
              return (
                <div key={item.id}
                  className="h-full bg-primary/60 flex items-center justify-center text-[9px] text-primary-foreground font-medium overflow-hidden min-w-[2px] rounded-sm"
                  style={{ width: `${pct}%` }}
                  title={`CUT ${item.cutIndex + 1}: ${fmt(eff)}`}>
                  {pct > 5 ? `C${item.cutIndex + 1}` : ''}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">전체 {fmt(totalDuration)}</p>
        </div>
      )}

      {/* 렌더 결과 */}
      {renderResult && (
        <div className="border-t p-4 bg-muted/20 space-y-2">
          <p className="text-xs font-medium text-green-600 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" />렌더링 완료
          </p>
          <video src={renderResult} controls className="w-full max-w-2xl rounded border" />
          <a href={renderResult} download className="inline-flex items-center gap-1 text-xs text-primary underline">
            <Download className="h-3 w-3" />다운로드
          </a>
        </div>
      )}
    </div>
  );
}

export default function TimelinePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <TimelinePageInner />
    </Suspense>
  );
}
