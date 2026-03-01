'use client';

import { Button } from '@/components/ui/button';
import { Trash2, RotateCcw, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { WebtoonAnimationVideoTest } from '@/lib/supabase';

interface VideoTestCardProps {
  test: WebtoonAnimationVideoTest;
  onDelete: (id: string) => void;
  onRegenerate: (test: WebtoonAnimationVideoTest) => void;
}

const STATUS_MAP = {
  pending: { icon: Clock, label: '대기', color: 'text-muted-foreground' },
  generating: { icon: Loader2, label: '생성중', color: 'text-blue-500', spin: true },
  completed: { icon: CheckCircle2, label: '완료', color: 'text-green-500' },
  failed: { icon: XCircle, label: '실패', color: 'text-destructive' },
} as const;

const SAFETY_COLORS = {
  lenient: 'bg-green-100 text-green-800',
  moderate: 'bg-yellow-100 text-yellow-800',
  strict: 'bg-red-100 text-red-800',
};

export function VideoTestCard({ test, onDelete, onRegenerate }: VideoTestCardProps) {
  const status = STATUS_MAP[test.status] || STATUS_MAP.pending;
  const StatusIcon = status.icon;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{test.provider}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
            {test.input_mode === 'single_image' ? '단일' : test.input_mode === 'start_end_frame' ? 'S+E' : '다중'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <StatusIcon className={`w-3.5 h-3.5 ${status.color} ${'spin' in status ? 'animate-spin' : ''}`} />
          <span className={`text-xs ${status.color}`}>{status.label}</span>
        </div>
      </div>

      {/* Video / Error */}
      <div className="aspect-video bg-black/5 flex items-center justify-center">
        {test.status === 'completed' && test.video_url ? (
          <video
            src={test.video_url}
            controls
            loop
            className="w-full h-full object-contain"
            playsInline
          />
        ) : test.status === 'failed' ? (
          <div className="text-xs text-destructive text-center px-3">
            {test.error_message || '실패'}
          </div>
        ) : test.status === 'generating' ? (
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs text-muted-foreground">대기 중</span>
        )}
      </div>

      {/* Info */}
      <div className="px-3 py-2 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>컷: {test.input_cut_indices.join('→')}</span>
          <span>{test.duration_seconds}초</span>
          <span>{test.aspect_ratio}</span>
          {test.elapsed_ms && <span>{(test.elapsed_ms / 1000).toFixed(1)}s</span>}
        </div>
        {test.prompt && (
          <p className="text-xs text-muted-foreground line-clamp-2">{test.prompt}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 rounded-none text-xs h-8"
          onClick={() => onRegenerate(test)}
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          재생성
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 rounded-none text-xs h-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(test.id)}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          삭제
        </Button>
      </div>
    </div>
  );
}
