'use client';

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  Upload,
  Trash2,
  GripVertical,
  Loader2,
  Download,
  Film,
  X,
} from 'lucide-react';
import Link from 'next/link';
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface VideoItem {
  id: string;
  file: File;
  name: string;
  size: number;
  duration: number | null;
  thumbnailUrl: string | null;
  objectUrl: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}sec`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}sec`;
}

function SortableVideoItem({
  item,
  index,
  onRemove,
  onPreview,
}: {
  item: VideoItem;
  index: number;
  onRemove: (id: string) => void;
  onPreview: (item: VideoItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-shadow ${
        isDragging ? 'shadow-lg opacity-80 z-50' : 'hover:shadow-sm'
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex-shrink-0 text-sm font-mono text-muted-foreground w-6 text-right">
        {index + 1}
      </div>

      <div
        className="flex-shrink-0 w-24 h-14 bg-muted rounded overflow-hidden cursor-pointer"
        onClick={() => onPreview(item)}
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(item.size)}
          {item.duration !== null && ` · ${formatDuration(item.duration)}`}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(item.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function MergeVideosPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [merging, setMerging] = useState(false);
  const [progress, setProgress] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoItem | null>(null);
  const nextId = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const extractVideoMeta = useCallback(
    (file: File, objectUrl: string): Promise<{ duration: number; thumbnail: string | null }> => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;

        video.onloadedmetadata = () => {
          const duration = video.duration;
          video.currentTime = Math.min(1, duration / 2);
        };

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              resolve({ duration: video.duration, thumbnail: canvas.toDataURL('image/jpeg', 0.7) });
            } else {
              resolve({ duration: video.duration, thumbnail: null });
            }
          } catch {
            resolve({ duration: video.duration, thumbnail: null });
          }
        };

        video.onerror = () => resolve({ duration: 0, thumbnail: null });
        video.src = objectUrl;
      });
    },
    []
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const videoFiles = acceptedFiles.filter((f) => f.type.startsWith('video/'));
      if (videoFiles.length === 0) return;

      const sorted = [...videoFiles].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );

      const newItems: VideoItem[] = [];

      for (const file of sorted) {
        const id = `video-${nextId.current++}`;
        const objectUrl = URL.createObjectURL(file);
        const meta = await extractVideoMeta(file, objectUrl);

        newItems.push({
          id,
          file,
          name: file.name,
          size: file.size,
          duration: meta.duration || null,
          thumbnailUrl: meta.thumbnail,
          objectUrl,
        });
      }

      setVideos((prev) => [...prev, ...newItems]);
      setResultUrl(null);
    },
    [extractVideoMeta]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.webm', '.mov', '.avi', '.mkv'] },
    multiple: true,
  });

  const handleRemove = useCallback((id: string) => {
    setVideos((prev) => {
      const item = prev.find((v) => v.id === id);
      if (item) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((v) => v.id !== id);
    });
    setResultUrl(null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setVideos((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setResultUrl(null);
    }
  }, []);

  const handleClearAll = useCallback(() => {
    videos.forEach((v) => URL.revokeObjectURL(v.objectUrl));
    setVideos([]);
    setResultUrl(null);
  }, [videos]);

  const totalDuration = videos.reduce((sum, v) => sum + (v.duration || 0), 0);

  const handleMerge = async () => {
    if (videos.length < 2) {
      alert('영상을 2개 이상 추가해주세요.');
      return;
    }

    setMerging(true);
    setProgress('영상 파일 업로드 중...');
    setResultUrl(null);

    try {
      const formData = new FormData();
      videos.forEach((v, i) => {
        formData.append('videos', v.file);
        formData.append('order', String(i));
      });

      setProgress('영상 병합 중... (시간이 걸릴 수 있습니다)');

      const res = await fetch('/api/webtoonanimation/merge-videos', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '병합 실패');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setProgress('');
    } catch (e) {
      console.error('병합 실패:', e);
      alert(`영상 병합 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
      setProgress('');
    } finally {
      setMerging(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `merged_${Date.now()}.mp4`;
    a.click();
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/webtoonanimation">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">영상 이어붙이기</h1>
          <p className="text-sm text-muted-foreground">
            영상 파일들을 업로드하고 순서를 정해 하나로 합칩니다
          </p>
        </div>
      </div>

      {/* 업로드 영역 */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-6 ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isDragActive
            ? '여기에 영상 파일을 놓으세요'
            : '영상 파일을 드래그하거나 클릭하여 업로드'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          MP4, WebM, MOV, AVI, MKV 지원
        </p>
      </div>

      {/* 영상 목록 */}
      {videos.length > 0 && (
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {videos.length}개 영상
              {totalDuration > 0 && ` · 총 ${formatDuration(totalDuration)}`}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleClearAll}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              전체 삭제
            </Button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={videos.map((v) => v.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {videos.map((video, index) => (
                  <SortableVideoItem
                    key={video.id}
                    item={video}
                    index={index}
                    onRemove={handleRemove}
                    onPreview={setPreviewVideo}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* 병합 버튼 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleMerge}
              disabled={merging || videos.length < 2}
              className="flex-1"
              size="lg"
            >
              {merging ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {progress || '병합 중...'}
                </>
              ) : (
                <>
                  <Film className="h-4 w-4 mr-2" />
                  영상 합치기 ({videos.length}개)
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* 결과 */}
      {resultUrl && (
        <Card className="mb-6">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">병합 완료</h3>
              <Button onClick={handleDownload} size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                다운로드
              </Button>
            </div>
            <video
              src={resultUrl}
              controls
              className="w-full rounded border max-h-[400px]"
            />
          </CardContent>
        </Card>
      )}

      {/* 미리보기 모달 */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="relative bg-card rounded-lg overflow-hidden max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b">
              <p className="text-sm font-medium truncate">{previewVideo.name}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setPreviewVideo(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <video
              src={previewVideo.objectUrl}
              controls
              autoPlay
              className="w-full max-h-[70vh]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
