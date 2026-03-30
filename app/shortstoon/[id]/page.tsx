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
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Upload,
  Loader2,
  Download,
  Film,
  CheckCircle2,
  Video,
} from 'lucide-react';
import {
  ShortstoonProject,
  ShortstoonBlock,
  ShortstoonViewport,
  ShortstoonEffectType,
  ShortstoonTransitionType,
} from '@/lib/supabase';
import { ViewportEditor } from '@/components/shortstoon/ViewportEditor';
import { EffectSelector, TransitionSelector } from '@/components/shortstoon/EffectSelector';
import { BlockCard } from '@/components/shortstoon/BlockCard';

export default function ShortstoonEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<ShortstoonProject | null>(null);
  const [blocks, setBlocks] = useState<ShortstoonBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [renderingIds, setRenderingIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 데이터 로드
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

  // 선택된 블록
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  // 블록 로컬 업데이트 + 서버 저장 (디바운스)
  const updateBlock = useCallback((id: string, fields: Partial<ShortstoonBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...fields } : b));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await fetch('/api/shortstoon', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'block', id, ...fields }),
      });
    }, 500);
  }, []);

  // PSD 파일: 브라우저 Canvas로 합성 → PNG blob → 서명 URL로 직접 업로드
  const uploadPsd = async (file: File, projectId: string, orderIndex: number): Promise<ShortstoonBlock> => {
    const { readPsd } = await import('ag-psd');

    // 1. PSD → PNG blob
    const arrayBuffer = await file.arrayBuffer();
    const psd = readPsd(arrayBuffer);
    const canvas = psd.canvas as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('PSD 합성 실패: canvas 없음');

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 변환 실패')), 'image/png');
    });

    const pngName = file.name.replace(/\.psd$/i, '.png');

    // 2. 서버에서 서명 URL 발급
    const signRes = await fetch('/api/shortstoon/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName: pngName }),
    });
    if (!signRes.ok) throw new Error('서명 URL 발급 실패');
    const { signedUrl, storagePath } = await signRes.json();

    // 3. 서명 URL로 PNG 직접 업로드
    const uploadRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!uploadRes.ok) throw new Error(`Storage 업로드 실패: ${uploadRes.status}`);

    // 4. DB 블록 생성 (storagePath만 전달)
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

  // 벌크 업로드
  const onDrop = useCallback(async (files: File[]) => {
    if (files.length === 0 || !id) return;
    setUploading(true);
    setUploadProgress(0);

    const startIndex = blocks.length;
    const newBlocks: ShortstoonBlock[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

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
      const imageData = await new Promise<string>(resolve => {
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/shortstoon/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          imageData,
          mimeType: file.type || 'image/jpeg',
          fileName: file.name,
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
    if (newBlocks.length > 0 && !selectedId) {
      setSelectedId(newBlocks[0].id);
    }
    setUploading(false);
    setUploadProgress(0);
  }, [id, blocks.length, selectedId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'], 'application/octet-stream': ['.psd'] },
    disabled: uploading,
    multiple: true,
    noClick: false,
  });

  // 드래그 정렬
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
      ...b,
      order_index: i,
    }));
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

  // 블록 복사
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
    // viewport/effect 복사
    await fetch('/api/shortstoon', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'block',
        id: newBlock.id,
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

  // 블록 삭제
  const handleDelete = async (blockId: string) => {
    await fetch(`/api/shortstoon?blockId=${blockId}`, { method: 'DELETE' });
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedId === blockId) setSelectedId(null);
  };

  // 개별 블록 렌더링
  const handleRender = async (blockId: string) => {
    setRenderingIds(prev => new Set(prev).add(blockId));
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, status: 'rendering' } : b));

    const res = await fetch('/api/shortstoon/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId }),
    });
    const updated: ShortstoonBlock = await res.json();
    setBlocks(prev => prev.map(b => b.id === blockId ? updated : b));
    setRenderingIds(prev => { const s = new Set(prev); s.delete(blockId); return s; });
  };

  // 전체 렌더링
  const handleRenderAll = async () => {
    for (const block of blocks) {
      if (block.status !== 'completed') {
        await handleRender(block.id);
      }
    }
  };

  // 병합 다운로드
  const handleMerge = async () => {
    const completedCount = blocks.filter(b => b.status === 'completed').length;
    if (completedCount === 0) {
      alert('먼저 블록을 렌더링해주세요');
      return;
    }
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

  // 프로젝트 이름 저장
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
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const completedCount = blocks.filter(b => b.status === 'completed').length;

  return (
    <div className="h-full flex flex-col">
      {/* 상단 툴바 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background/95 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push('/shortstoon')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* 프로젝트 이름 */}
        {editingName ? (
          <Input
            className="h-7 text-sm max-w-[200px]"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
            onBlur={handleNameSave}
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-medium cursor-pointer hover:text-primary transition-colors"
            onClick={() => { setNameInput(project?.name ?? ''); setEditingName(true); }}
          >
            {project?.name}
          </span>
        )}

        <div className="flex-1" />

        {/* 상태 표시 */}
        {blocks.length > 0 && (
          <Badge variant="outline" className="text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {completedCount}/{blocks.length}
          </Badge>
        )}

        {/* 전체 렌더링 */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleRenderAll}
          disabled={blocks.length === 0 || blocks.every(b => b.status === 'completed')}
        >
          <Video className="h-3.5 w-3.5 mr-1" />
          전체 렌더링
        </Button>

        {/* 병합 다운로드 */}
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleMerge}
          disabled={merging || completedCount === 0}
        >
          {merging
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <Download className="h-3.5 w-3.5 mr-1" />
          }
          내보내기
        </Button>
      </div>

      {/* 메인 레이아웃 */}
      <div className="flex-1 flex min-h-0">
        {/* 좌측: 블록 목록 */}
        <div className="w-64 flex-shrink-0 border-r flex flex-col">
          {/* 업로드 영역 */}
          <div className="p-3 border-b">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="space-y-1">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    {isDragActive ? '놓으세요' : '이미지 업로드 (벌크)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 블록 목록 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {blocks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">이미지를 업로드하세요</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
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
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        {/* 우측: 편집 패널 */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedBlock ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Film className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">블록을 선택하면 편집할 수 있습니다</p>
              </div>
            </div>
          ) : (
            <div className="max-w-sm mx-auto space-y-6">
              {/* 뷰포트 편집기 */}
              <div>
                <h3 className="text-sm font-medium mb-3">뷰포트 설정</h3>
                <ViewportEditor
                  imageUrl={selectedBlock.image_url}
                  viewport={selectedBlock.viewport}
                  onChange={(vp: ShortstoonViewport) => updateBlock(selectedBlock.id, { viewport: vp })}
                  effectType={selectedBlock.effect_type}
                  effectParams={selectedBlock.effect_params}
                  durationMs={selectedBlock.duration_ms}
                />
              </div>

              <Separator />

              {/* 효과 설정 */}
              <div>
                <h3 className="text-sm font-medium mb-3">효과</h3>
                <EffectSelector
                  effectType={selectedBlock.effect_type}
                  effectParams={selectedBlock.effect_params}
                  durationMs={selectedBlock.duration_ms}
                  onChange={(type: ShortstoonEffectType, params: Record<string, unknown>) =>
                    updateBlock(selectedBlock.id, { effect_type: type, effect_params: params })
                  }
                  onDurationChange={(ms: number) => updateBlock(selectedBlock.id, { duration_ms: ms })}
                />
              </div>

              <Separator />

              {/* 트랜지션 */}
              <div>
                <h3 className="text-sm font-medium mb-3">다음 블록으로 전환</h3>
                <TransitionSelector
                  transitionType={selectedBlock.transition_type}
                  transitionDurationMs={selectedBlock.transition_duration_ms}
                  onChange={(type: ShortstoonTransitionType, durationMs: number) =>
                    updateBlock(selectedBlock.id, { transition_type: type, transition_duration_ms: durationMs })
                  }
                />
              </div>

              <Separator />

              {/* 렌더링 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">렌더링</h3>
                {selectedBlock.status === 'completed' && selectedBlock.video_url && (
                  <video
                    src={selectedBlock.video_url}
                    controls
                    className="w-full rounded border"
                    style={{ maxHeight: 300 }}
                  />
                )}
                {selectedBlock.status === 'failed' && (
                  <p className="text-xs text-destructive">{selectedBlock.error_message}</p>
                )}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => handleRender(selectedBlock.id)}
                  disabled={renderingIds.has(selectedBlock.id) || selectedBlock.status === 'rendering'}
                >
                  {(renderingIds.has(selectedBlock.id) || selectedBlock.status === 'rendering')
                    ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />렌더링 중...</>
                    : selectedBlock.status === 'completed'
                    ? '다시 렌더링'
                    : '이 블록 렌더링'
                  }
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 이미지 URL → base64 (복사 시 사용)
async function imageUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.readAsDataURL(blob);
  });
}
