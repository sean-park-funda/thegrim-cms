'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, Trash2, Loader2 } from 'lucide-react';
import { ShortstoonBlock, SHORTSTOON_EFFECT_LABELS } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface BlockCardProps {
  block: ShortstoonBlock;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const STATUS_DOT: Record<string, string> = {
  pending:   'bg-white/20',
  rendering: 'bg-blue-400 animate-pulse',
  completed: 'bg-green-500',
  failed:    'bg-red-500',
};

export function BlockCard({ block, index, isSelected, onSelect, onCopy, onDelete }: BlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={cn(
        'group relative flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all',
        'cursor-grab active:cursor-grabbing select-none',
        isSelected
          ? 'bg-white/10 ring-1 ring-white/20'
          : 'hover:bg-white/5',
        isDragging && 'shadow-2xl ring-1 ring-white/20 bg-white/10'
      )}
    >
      {/* 썸네일 (9:16 비율) */}
      <div className="relative flex-shrink-0 w-[38px] h-[67px] rounded overflow-hidden bg-white/5">
        <img
          src={block.image_url.replace('/object/', '/render/image/') + '?width=120&quality=70'}
          alt={block.file_name}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
        {block.status === 'rendering' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
          </div>
        )}
        {block.status === 'completed' && (
          <div className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-green-500 ring-1 ring-black/50" />
        )}
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-white/60">#{index + 1}</span>
          <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT[block.status])} />
        </div>
        <p className="text-[11px] text-white/60 mt-0.5 truncate">{block.file_name}</p>
        <p className="text-[10px] text-white/25 mt-0.5 truncate">
          {(block.duration_ms / 1000).toFixed(1)}s
          {block.effect_type !== 'none' && (
            <span className="ml-1 text-primary/50">· {SHORTSTOON_EFFECT_LABELS[block.effect_type]}</span>
          )}
        </p>
      </div>

      {/* 호버 액션 — 클릭 이벤트 차단 */}
      <div
        className="flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors"
          title="복사"
          onClick={onCopy}
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="삭제"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
