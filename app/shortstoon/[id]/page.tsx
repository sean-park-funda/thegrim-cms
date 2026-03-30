'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Upload,
  Loader2,
  Download,
  Film,
  Video,
  Pencil,
  Check,
  X,
  Sparkles,
  Play,
  Square,
  StopCircle,
  Pause,
} from 'lucide-react';
import {
  ShortstoonProject,
  ShortstoonBlock,
  ShortstoonViewport,
  ShortstoonEffectType,
  ShortstoonTransitionType,
} from '@/lib/supabase';
import { ViewportEditor, ViewportEditorHandle } from '@/components/shortstoon/ViewportEditor';
import { EffectSelector, TransitionSelector } from '@/components/shortstoon/EffectSelector';
import { BlockCard } from '@/components/shortstoon/BlockCard';
import { cn } from '@/lib/utils';

function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const handleStop = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPlaying(false);
    setProgress(0);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
  };

  const handleEnded = () => setPlaying(false);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value) / 1000 * v.duration;
    v.currentTime = t;
    setProgress(Number(e.target.value) / 1000);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div style={{ width: 432 }}>
      <video
        ref={videoRef}
        src={src}
        style={{ width: 432, height: 768, borderRadius: 12, background: '#000', display: 'block' }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={handleEnded}
      />
      <div className="mt-2 space-y-1.5">
        <input
          type="range" min={0} max={1000} step={1}
          value={Math.round(progress * 1000)}
          onChange={handleSeek}
          className="w-full h-1.5 accent-primary cursor-pointer"
        />
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={togglePlay}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleStop}>
              <StopCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {fmt(progress * duration)} / {fmt(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ShortstoonEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<ShortstoonProject | null>(null);
  const [blocks, setBlocks] = useState<ShortstoonBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [aiMotionMap, setAiMotionMap] = useState<Record<string, { enabled: boolean; motion_type: string; prompt: string }>>({});
  const [merging, setMerging] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportEditorRef = useRef<ViewportEditorHandle>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadProject = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/shortstoon?projectId=${id}`);
    if (!res.ok) { router.push('/shortstoon'); return; }
    const data: ShortstoonProject = await res.json();
    setProject(data);
    setBlocks(data.blocks ?? []);
    setLoading(false);
  }, [id, router]);

  useEffect(() => { loadProject(); }, [loadProject]);

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  const updateBlock = useCallback((blockId: string, fields: Partial<ShortstoonBlock>) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...fields } : b));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await fetch('/api/shortstoon', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'block', id: blockId, ...fields }),
      });
    }, 500);
  }, []);

  // 긴 쪽 기준 maxPx 이하로 리사이즈 (Canvas → Blob)
  const resizeCanvas = (src: HTMLCanvasElement, maxPx = 1920): Blob | Promise<Blob> => {
    const { width: w, height: h } = src;
    const scale = Math.min(1, maxPx / Math.max(w, h));
    if (scale === 1) {
      return new Promise<Blob>((res, rej) => src.toBlob(b => b ? res(b) : rej(new Error('toBlob 실패')), 'image/png'));
    }
    const out = document.createElement('canvas');
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
    return new Promise<Blob>((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('toBlob 실패')), 'image/png'));
  };

  // 일반 이미지 dataURL → 리사이즈 후 dataURL 반환
  const resizeDataUrl = (dataUrl: string, maxPx = 1920): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxPx / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  // PSD: Canvas 합성 → 리사이즈 → 서명 URL로 직접 업로드
  const uploadPsd = async (file: File, projectId: string, orderIndex: number): Promise<ShortstoonBlock> => {
    const { readPsd } = await import('ag-psd');
    const arrayBuffer = await file.arrayBuffer();
    const psd = readPsd(arrayBuffer);
    const canvas = psd.canvas as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('PSD 합성 실패');

    const blob = await resizeCanvas(canvas);

    const pngName = file.name.replace(/\.psd$/i, '.png');
    const signRes = await fetch('/api/shortstoon/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName: pngName }),
    });
    if (!signRes.ok) throw new Error('서명 URL 발급 실패');
    const { signedUrl, storagePath } = await signRes.json();

    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!uploadRes.ok) throw new Error(`Storage 업로드 실패: ${uploadRes.status}`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/webtoon-files/${storagePath}`;

    const res = await fetch('/api/shortstoon/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName: pngName, orderIndex, storagePath, publicUrl }),
    });
    if (!res.ok) throw new Error('블록 생성 실패');
    return res.json();
  };

  const onDrop = useCallback(async (files: File[]) => {
    if (files.length === 0 || !id) return;
    setUploading(true);
    setUploadProgress(0);

    const startIndex = blocks.length;
    const newBlocks: ShortstoonBlock[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadLabel(`${file.name} (${i + 1}/${files.length})`);

      if (file.name.toLowerCase().endsWith('.psd')) {
        try {
          const block = await uploadPsd(file, id, startIndex + i);
          newBlocks.push(block);
        } catch (e) {
          console.error('[PSD 업로드 실패]', e);
        }
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
        continue;
      }

      const reader = new FileReader();
      const rawData = await new Promise<string>(resolve => {
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
      const imageData = await resizeDataUrl(rawData);

      const res = await fetch('/api/shortstoon/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          imageData,
          mimeType: 'image/png',
          fileName: file.name.replace(/\.(jpe?g|webp)$/i, '.png'),
          orderIndex: startIndex + i,
        }),
      });

      if (res.ok) {
        const block: ShortstoonBlock = await res.json();
        newBlocks.push(block);
      }

      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }

    setBlocks(prev => [...prev, ...newBlocks]);
    if (newBlocks.length > 0 && !selectedId) setSelectedId(newBlocks[0].id);
    setUploading(false);
    setUploadProgress(0);
    setUploadLabel('');
  }, [id, blocks.length, selectedId]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'application/octet-stream': ['.psd'] },
    disabled: uploading,
    multiple: true,
    noClick: true, // 클릭은 open()으로 직접 제어
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({ ...b, order_index: i }));
    setBlocks(reordered);

    await fetch('/api/shortstoon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reorder_blocks',
        blockOrders: reordered.map(b => ({ id: b.id, order_index: b.order_index })),
      }),
    });
  };

  const handleCopy = async (block: ShortstoonBlock) => {
    const res = await fetch('/api/shortstoon/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: id,
        imageData: await imageUrlToBase64(block.image_url),
        mimeType: 'image/jpeg',
        fileName: block.file_name,
        orderIndex: blocks.length,
      }),
    });
    if (!res.ok) return;
    const newBlock: ShortstoonBlock = await res.json();
    await fetch('/api/shortstoon', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'block', id: newBlock.id,
        viewport: block.viewport,
        effect_type: block.effect_type,
        effect_params: block.effect_params,
        duration_ms: block.duration_ms,
        transition_type: block.transition_type,
        transition_duration_ms: block.transition_duration_ms,
      }),
    });
    setBlocks(prev => [...prev, {
      ...newBlock,
      viewport: block.viewport,
      effect_type: block.effect_type,
      effect_params: block.effect_params,
      duration_ms: block.duration_ms,
      transition_type: block.transition_type,
      transition_duration_ms: block.transition_duration_ms,
    }]);
  };

  const handleDelete = async (blockId: string) => {
    await fetch(`/api/shortstoon?blockId=${blockId}`, { method: 'DELETE' });
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedId === blockId) setSelectedId(null);
  };

  const getAiMotion = (blockId: string) => aiMotionMap[blockId] ?? { enabled: false, motion_type: 'blink', prompt: '' };

  const handleRender = async (blockId: string) => {
    const ai = getAiMotion(blockId);
    setRenderingIds(prev => new Set(prev).add(blockId));
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, status: 'rendering' } : b));

    const currentBlock = blocks.find(b => b.id === blockId);

    // Lightsail에 렌더링 위임 (즉시 반환)
    // duration_ms를 클라이언트 상태에서 직접 전달 — DB 저장 딜레이 무관하게 최신값 사용
    await fetch('/api/shortstoon/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId,
        durationMs: currentBlock?.duration_ms,
        aiMotionEnabled: ai.enabled,
        aiMotionType: ai.motion_type,
        aiMotionPrompt: ai.prompt,
      }),
    });

    // 완료될 때까지 2초 간격 폴링
    const poll = setInterval(async () => {
      const res = await fetch(`/api/shortstoon/blocks/${blockId}`);
      if (!res.ok) return;
      const block: ShortstoonBlock = await res.json();
      if (block.status === 'completed' || block.status === 'failed') {
        setBlocks(prev => prev.map(b => b.id === blockId ? block : b));
        setRenderingIds(prev => { const s = new Set(prev); s.delete(blockId); return s; });
        clearInterval(poll);
      }
    }, 2000);

    // 최대 3분 후 타임아웃
    setTimeout(() => {
      clearInterval(poll);
      setRenderingIds(prev => { const s = new Set(prev); s.delete(blockId); return s; });
    }, 180000);
  };

  const handleRenderAll = async () => {
    for (const block of blocks) {
      if (block.status !== 'completed') await handleRender(block.id);
    }
  };

  const handleMerge = async () => {
    const completedCount = blocks.filter(b => b.status === 'completed').length;
    if (completedCount === 0) { alert('먼저 블록을 렌더링해주세요'); return; }
    setMerging(true);
    const res = await fetch('/api/shortstoon/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shortstoon_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert('병합 실패');
    }
    setMerging(false);
  };

  const handleNameSave = async () => {
    if (!project || !nameInput.trim()) { setEditingName(false); return; }
    await fetch('/api/shortstoon', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'project', id: project.id, name: nameInput.trim() }),
    });
    setProject(p => p ? { ...p, name: nameInput.trim() } : p);
    setEditingName(false);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">불러오는 중...</p>
        </div>
      </div>
    );
  }

  const completedCount = blocks.filter(b => b.status === 'completed').length;
  const totalCount = blocks.length;

  return (
    <div className="h-full flex flex-col bg-background">

      {/* ── 상단 툴바 ─────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-3 h-11 border-b bg-background/95 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/shortstoon')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="w-px h-4 bg-border mx-1" />

        {/* 프로젝트 이름 */}
        {editingName ? (
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-sm w-44 px-2"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') setEditingName(false);
              }}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500" onClick={handleNameSave}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setEditingName(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            className="group flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
            onClick={() => { setNameInput(project?.name ?? ''); setEditingName(true); }}
          >
            {project?.name}
            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
          </button>
        )}

        <div className="flex-1" />

        {/* 진행률 표시 */}
        {totalCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {blocks.slice(0, Math.min(totalCount, 10)).map(b => (
                  <div
                    key={b.id}
                    className={cn(
                      'w-1.5 h-3 rounded-sm',
                      b.status === 'completed' ? 'bg-green-500' :
                      b.status === 'rendering' ? 'bg-blue-400 animate-pulse' :
                      b.status === 'failed' ? 'bg-red-400' :
                      'bg-muted-foreground/30'
                    )}
                  />
                ))}
                {totalCount > 10 && <span className="text-muted-foreground/50 ml-0.5">+{totalCount - 10}</span>}
              </div>
              <span>{completedCount}/{totalCount}</span>
            </div>
          </div>
        )}

        <div className="w-px h-4 bg-border mx-1" />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5"
          onClick={handleRenderAll}
          disabled={totalCount === 0 || blocks.every(b => b.status === 'completed')}
        >
          <Video className="h-3.5 w-3.5" />
          전체 렌더링
        </Button>

        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 bg-primary"
          onClick={handleMerge}
          disabled={merging || completedCount === 0}
        >
          {merging
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />
          }
          내보내기
        </Button>
      </header>

      {/* ── 메인 레이아웃 ─────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* 좌측: 컷 목록 패널 — aside 전체가 드롭존 */}
        <aside
          {...getRootProps()}
          className={cn(
            'w-[220px] flex-shrink-0 border-r flex flex-col bg-[#111111] transition-colors relative',
            isDragActive && 'bg-primary/5'
          )}
        >
          <input {...getInputProps()} />

          {/* 드래그 오버레이 */}
          {isDragActive && (
            <div className="absolute inset-0 z-10 border-2 border-primary/60 rounded-none pointer-events-none flex items-center justify-center">
              <div className="bg-[#111111]/90 rounded-xl px-5 py-4 flex flex-col items-center gap-2">
                <Upload className="h-6 w-6 text-primary" />
                <p className="text-sm font-medium text-primary">여기에 놓으세요</p>
              </div>
            </div>
          )}

          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 flex-shrink-0">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              컷 목록
              {totalCount > 0 && (
                <span className="ml-1.5 text-white/30 font-normal normal-case tracking-normal">
                  {totalCount}
                </span>
              )}
            </span>
            <Button
              variant="ghost" size="sm"
              disabled={uploading}
              onClick={e => { e.stopPropagation(); open(); }}
              className="h-6 px-2 text-xs gap-1 text-white/50 hover:text-white hover:bg-white/10"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {uploading ? `${uploadProgress}%` : '추가'}
            </Button>
          </div>

          {/* 블록 목록 */}
          <div className="flex-1 overflow-y-auto py-2 min-h-0">
            {totalCount === 0 && !uploading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
                <Film className="h-7 w-7 text-white/15" />
                <p className="text-xs text-white/25">이미지를 드래그하거나<br />추가 버튼을 눌러주세요</p>
                <p className="text-[10px] text-white/15">PNG · JPG · PSD</p>
              </div>
            )}
            {totalCount > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5 px-2">
                    {blocks.map((block, i) => (
                      <BlockCard
                        key={block.id}
                        block={block}
                        index={i}
                        isSelected={selectedId === block.id}
                        onSelect={() => setSelectedId(block.id)}
                        onCopy={() => handleCopy(block)}
                        onDelete={() => handleDelete(block.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* 업로드 진행 상태 — 하단 */}
          {uploading && (
            <div className="flex-shrink-0 px-3 py-2.5 border-t border-white/5">
              <p className="text-[10px] text-white/40 truncate mb-1">{uploadLabel}</p>
              <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-white/25 mt-1 text-right">{uploadProgress}%</p>
            </div>
          )}
        </aside>

        {/* 우측: 편집 패널 */}
        <main className="flex-1 overflow-y-auto">
          {!selectedBlock ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                  <Film className="h-7 w-7 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/70">컷을 선택하세요</p>
                  <p className="text-xs text-muted-foreground mt-0.5">왼쪽 목록에서 컷을 클릭하면 편집할 수 있습니다</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex gap-6 py-6 px-6 min-h-full">

              {/* 좌: 뷰포트 */}
              <div className="flex-shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Film className="h-3.5 w-3.5" />뷰포트
                </p>
                <ViewportEditor
                  ref={viewportEditorRef}
                  imageUrl={selectedBlock.image_url}
                  viewport={selectedBlock.viewport}
                  onChange={(vp: ShortstoonViewport) => updateBlock(selectedBlock.id, { viewport: vp })}
                  effectType={selectedBlock.effect_type}
                  effectParams={selectedBlock.effect_params}
                  durationMs={selectedBlock.duration_ms}
                />
              </div>

              {/* 중: 효과 + 전환 + 렌더링 */}
              <div className="flex-1 min-w-[260px] max-w-[380px] space-y-5 py-0">

                <section>
                  <SectionHeader icon={<Sparkles className="h-3.5 w-3.5" />} title="효과" />
                  <div className="mt-3">
                    <EffectSelector
                      effectType={selectedBlock.effect_type}
                      effectParams={selectedBlock.effect_params}
                      durationMs={selectedBlock.duration_ms}
                      onChange={(type: ShortstoonEffectType, params: Record<string, unknown>) =>
                        updateBlock(selectedBlock.id, { effect_type: type, effect_params: params })
                      }
                      onDurationChange={(ms: number) => updateBlock(selectedBlock.id, { duration_ms: ms })}
                      aiMotionEnabled={getAiMotion(selectedBlock.id).enabled}
                      aiMotionParams={getAiMotion(selectedBlock.id)}
                      onAiMotionChange={(enabled, params) =>
                        setAiMotionMap(prev => ({ ...prev, [selectedBlock.id]: { ...params, enabled } }))
                      }
                      previewPlaying={previewPlaying}
                      onPreviewToggle={() => {
                        viewportEditorRef.current?.togglePlay();
                        setPreviewPlaying(p => !p);
                      }}
                    />
                  </div>
                </section>

                <Divider />

                <section className="pb-6">
                  <SectionHeader icon={<Download className="h-3.5 w-3.5" />} title="렌더링" />
                  <div className="mt-3 space-y-3">
                    {selectedBlock.status === 'failed' && (
                      <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                        <p className="text-xs text-destructive">{selectedBlock.error_message ?? '렌더링 실패'}</p>
                      </div>
                    )}
                    <Button
                      className="w-full" size="sm"
                      variant={selectedBlock.status === 'completed' ? 'outline' : 'default'}
                      onClick={() => handleRender(selectedBlock.id)}
                      disabled={renderingIds.has(selectedBlock.id) || selectedBlock.status === 'rendering'}
                    >
                      {(renderingIds.has(selectedBlock.id) || selectedBlock.status === 'rendering') ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />렌더링 중...</>
                      ) : selectedBlock.status === 'completed' ? '다시 렌더링' : '이 컷 렌더링'}
                    </Button>
                  </div>
                </section>

              </div>

              {/* 우: 렌더링 결과 영상 */}
              <div className="flex-shrink-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5" />렌더링 결과
                </p>
                {selectedBlock.status === 'completed' && selectedBlock.video_url
                  ? <VideoPlayer key={selectedBlock.video_url} src={selectedBlock.video_url} />
                  : (
                    <div
                      style={{ width: 432, height: 768, borderRadius: 12 }}
                      className="bg-muted/30 border border-dashed border-muted-foreground/20 flex items-center justify-center"
                    >
                      <p className="text-xs text-muted-foreground">
                        {(renderingIds.has(selectedBlock.id) || selectedBlock.status === 'rendering')
                          ? '렌더링 중...' : '렌더링 전'}
                      </p>
                    </div>
                  )
                }
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/60" />;
}

async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.readAsDataURL(blob);
  });
}
