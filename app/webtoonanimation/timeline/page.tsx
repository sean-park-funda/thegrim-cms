'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Film, Loader2, Play, Download, Scissors, ChevronRight,
  GripVertical, Check,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, useSortable, horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────────

type TransitionType = 'cut' | 'fade' | 'dissolve' | 'wipe_left' | 'delay';

interface TransitionConfig {
  type: TransitionType;
  duration: number; // seconds
}

interface TimelineItem {
  id: string; // cutId
  cutIndex: number;
  videoUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  transition: TransitionConfig; // after this clip
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: string; defaultDur: number }[] = [
  { type: 'cut',      label: '컷',      icon: '✂',  defaultDur: 0   },
  { type: 'fade',     label: '페이드',  icon: '◐',  defaultDur: 0.5 },
  { type: 'dissolve', label: '디졸브',  icon: '◑',  defaultDur: 0.5 },
  { type: 'wipe_left',label: '와이프',  icon: '→',  defaultDur: 0.5 },
  { type: 'delay',    label: '딜레이',  icon: '⏸',  defaultDur: 1.0 },
];

const DEFAULT_TRANSITION: TransitionConfig = { type: 'cut', duration: 0 };

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmt(sec: number) {
  return sec < 60
    ? `${sec.toFixed(1)}s`
    : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
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

// ─── Trim Dialog ──────────────────────────────────────────────────────────────

function TrimDialog({
  item, open, onClose, onSave,
}: {
  item: TimelineItem;
  open: boolean;
  onClose: () => void;
  onSave: (trimStart: number, trimEnd: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(item.trimStart);
  const [end, setEnd] = useState(item.trimEnd);
  const dur = item.originalDuration;
  const effectiveDur = Math.max(0.1, dur - start - end);

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            CUT {item.cutIndex + 1} 트림 편집
          </DialogTitle>
        </DialogHeader>

        <video
          ref={videoRef}
          src={item.videoUrl}
          className="w-full rounded border bg-black"
          style={{ aspectRatio: '832/480' }}
          controls
        />

        {/* 미니 타임라인 */}
        <div className="relative h-6 bg-muted rounded overflow-hidden">
          <div
            className="absolute h-full bg-primary/20 border-l-2 border-r-2 border-primary"
            style={{
              left: `${(start / dur) * 100}%`,
              width: `${(effectiveDur / dur) * 100}%`,
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">시작 트림</Label>
              <span className="text-xs font-mono text-muted-foreground">{fmt(start)}</span>
            </div>
            <Slider
              min={0} max={Math.max(0, dur - end - 0.5)} step={0.1}
              value={[start]}
              onValueChange={(vals: number[]) => { setStart(vals[0]); seek(vals[0]); }}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs text-muted-foreground">끝 트림</Label>
              <span className="text-xs font-mono text-muted-foreground">{fmt(end)}</span>
            </div>
            <Slider
              min={0} max={Math.max(0, dur - start - 0.5)} step={0.1}
              value={[end]}
              onValueChange={(vals: number[]) => { setEnd(vals[0]); seek(Math.max(0, dur - vals[0] - 0.1)); }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            원본 {fmt(dur)} → 유효 <span className="font-medium text-foreground">{fmt(effectiveDur)}</span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={() => { onSave(start, end); onClose(); }}>
            <Check className="h-3.5 w-3.5 mr-1.5" />적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transition Popover (인라인 패널) ─────────────────────────────────────────

function TransitionEditor({
  config, onChange,
}: {
  config: TransitionConfig;
  onChange: (c: TransitionConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const opt = TRANSITION_OPTIONS.find((o) => o.type === config.type)!;

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 relative">
      {/* 연결선 */}
      <div className="flex items-center gap-0.5">
        <div className="w-6 h-0.5 bg-border" />
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex flex-col items-center justify-center w-9 h-9 rounded-full border-2 text-sm transition-colors',
            open ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-muted-foreground'
          )}
          title={opt.label}
        >
          {opt.icon}
        </button>
        <div className="w-6 h-0.5 bg-border" />
      </div>
      {config.type !== 'cut' && (
        <span className="text-[10px] text-muted-foreground">{fmt(config.duration)}</span>
      )}

      {/* 팝오버 */}
      {open && (
        <div className="absolute top-full mt-2 z-20 bg-popover border rounded-lg shadow-lg p-3 w-52 space-y-3">
          <div className="grid grid-cols-5 gap-1">
            {TRANSITION_OPTIONS.map((o) => (
              <button
                key={o.type}
                onClick={() => onChange({ type: o.type, duration: o.type === 'cut' ? 0 : (config.duration || o.defaultDur) })}
                className={cn(
                  'flex flex-col items-center py-1.5 rounded border text-lg transition-colors',
                  config.type === o.type ? 'border-primary bg-primary/10' : 'border-border hover:border-muted-foreground'
                )}
                title={o.label}
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
              <Input
                type="number" min={0.1} max={5} step={0.1}
                value={config.duration}
                onChange={(e) => onChange({ ...config, duration: parseFloat(e.target.value) || 0.5 })}
                className="h-7 text-xs w-20"
              />
              <span className="text-xs text-muted-foreground">초</span>
            </div>
          )}
          <button
            className="absolute top-1.5 right-2 text-muted-foreground hover:text-foreground text-xs"
            onClick={() => setOpen(false)}
          >✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Cut Card ────────────────────────────────────────────────────────

function SortableCutCard({
  item, onTrim, onTransitionChange, isLast,
}: {
  item: TimelineItem;
  onTrim: (id: string) => void;
  onTransitionChange: (id: string, t: TransitionConfig) => void;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const effectiveDur = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
  const hasTrim = item.trimStart > 0 || item.trimEnd > 0;

  return (
    <div className="flex items-center" style={style} ref={setNodeRef}>
      {/* Cut card */}
      <div className="w-52 shrink-0">
        <div className="rounded-lg border bg-card overflow-hidden">
          {/* 드래그 핸들 + 헤더 */}
          <div className="px-2 py-1.5 bg-muted/30 border-b flex items-center gap-1.5">
            <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold">CUT {item.cutIndex + 1}</span>
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              {hasTrim ? (
                <span className="text-amber-500">{fmt(effectiveDur)}</span>
              ) : fmt(effectiveDur)}
            </span>
          </div>

          {/* 썸네일 */}
          <div className="relative">
            <video
              src={item.videoUrl}
              className="w-full aspect-video object-cover bg-black"
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/40 rounded-full p-2">
                <Play className="h-4 w-4 text-white fill-white" />
              </div>
            </div>
          </div>

          {/* 트림 바 */}
          <div className="relative h-2 bg-muted/50 mx-2 my-1.5 rounded overflow-hidden">
            <div
              className="absolute h-full bg-primary rounded"
              style={{
                left: `${(item.trimStart / item.originalDuration) * 100}%`,
                width: `${(effectiveDur / item.originalDuration) * 100}%`,
              }}
            />
          </div>

          {/* 트림 버튼 */}
          <div className="px-2 pb-2">
            <button
              onClick={() => onTrim(item.id)}
              className={cn(
                'w-full text-xs py-1 rounded border flex items-center justify-center gap-1 transition-colors',
                hasTrim
                  ? 'border-amber-500/50 text-amber-500 bg-amber-500/5 hover:bg-amber-500/10'
                  : 'border-border text-muted-foreground hover:border-muted-foreground'
              )}
            >
              <Scissors className="h-3 w-3" />
              {hasTrim ? `트림 (${fmt(item.trimStart)}~${fmt(item.trimEnd)})` : '트림 편집'}
            </button>
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
  const [cuts, setCuts] = useState<WebtoonAnimationCut[]>([]);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [trimTarget, setTrimTarget] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderResult, setRenderResult] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── 데이터 로드 ──
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const [{ data: proj }, { data: cutsData }] = await Promise.all([
        supabase.from('webtoonanimation_projects').select('*').eq('id', projectId).single(),
        supabase.from('webtoonanimation_cuts').select('*').eq('project_id', projectId).order('order_index'),
      ]);
      if (proj) setProject(proj);
      if (cutsData) {
        setCuts(cutsData);
        // 영상 있는 컷만 타임라인에 추가
        const withVideo = cutsData.filter((c) => c.comfyui_video_url);
        const resolved: TimelineItem[] = await Promise.all(
          withVideo.map(async (c, idx) => {
            const dur = await getVideoDuration(c.comfyui_video_url!);
            return {
              id: c.id,
              cutIndex: c.order_index,
              videoUrl: c.comfyui_video_url!,
              originalDuration: dur,
              trimStart: 0,
              trimEnd: 0,
              transition: { ...DEFAULT_TRANSITION },
            };
          })
        );
        setItems(resolved);
      }
      setLoading(false);
    })();
  }, [projectId]);

  // ── 드래그 종료 ──
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

  // ── 트림 저장 ──
  const handleTrimSave = useCallback((trimStart: number, trimEnd: number) => {
    setItems((prev) => prev.map((i) => i.id === trimTarget ? { ...i, trimStart, trimEnd } : i));
  }, [trimTarget]);

  // ── 트랜지션 변경 ──
  const handleTransitionChange = useCallback((id: string, t: TransitionConfig) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, transition: t } : i));
  }, []);

  // ── 총 재생 시간 계산 ──
  const totalDuration = items.reduce((acc, item, idx) => {
    const eff = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
    if (idx === items.length - 1) return acc + eff;
    const t = item.transition;
    if (t.type === 'delay') return acc + eff + t.duration;
    if (t.type === 'cut') return acc + eff;
    return acc + eff - t.duration; // xfade overlap
  }, 0);

  // ── 렌더 ──
  const handleRender = async () => {
    if (items.length < 1) return;
    setRendering(true);
    setRenderResult(null);
    try {
      const payload = {
        projectId,
        items: items.map((item) => ({
          cutId: item.id,
          videoUrl: item.videoUrl,
          originalDuration: item.originalDuration,
          trimStart: item.trimStart,
          trimEnd: item.trimEnd,
          transition: item.transition,
        })),
      };
      const res = await fetch('/api/webtoonanimation/render-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.polling) {
        // 폴링: project에 result_url 저장됨
        const startTime = Date.now();
        while (Date.now() - startTime < 10 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 8000));
          const { data: proj } = await supabase
            .from('webtoonanimation_projects')
            .select('timeline_rendered_url')
            .eq('id', projectId)
            .single();
          if (proj?.timeline_rendered_url) {
            setRenderResult(proj.timeline_rendered_url);
            return;
          }
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

  const trimItem = items.find((i) => i.id === trimTarget);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
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
        <Button
          onClick={handleRender}
          disabled={rendering || items.length < 1}
          className="gap-1.5"
        >
          {rendering
            ? <><Loader2 className="h-4 w-4 animate-spin" />렌더링 중...</>
            : <><Film className="h-4 w-4" />렌더링 시작</>}
        </Button>
      </div>

      {/* 타임라인 영역 */}
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
                    onTrim={(id) => setTrimTarget(id)}
                    onTransitionChange={handleTransitionChange}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 타임라인 바 (하단) */}
      {items.length > 0 && (
        <div className="border-t px-6 py-3">
          <div className="flex h-6 rounded overflow-hidden gap-px">
            {items.map((item, idx) => {
              const eff = Math.max(0, item.originalDuration - item.trimStart - item.trimEnd);
              const pct = (eff / totalDuration) * 100;
              return (
                <div
                  key={item.id}
                  className="h-full bg-primary/60 flex items-center justify-center text-[9px] text-primary-foreground font-medium overflow-hidden min-w-[2px] rounded-sm"
                  style={{ width: `${pct}%` }}
                  title={`CUT ${item.cutIndex + 1}: ${fmt(eff)}`}
                >
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

      {/* 트림 다이얼로그 */}
      {trimItem && (
        <TrimDialog
          item={trimItem}
          open={!!trimTarget}
          onClose={() => setTrimTarget(null)}
          onSave={handleTrimSave}
        />
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
