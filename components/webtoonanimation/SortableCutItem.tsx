'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X } from 'lucide-react';
import { WebtoonAnimationCut } from '@/lib/supabase';

interface SortableCutItemProps {
  cut: WebtoonAnimationCut;
  displayIndex: number;
  isSelected: boolean;
  onRemove: (id: string) => void;
  onOpenDetail?: (cut: WebtoonAnimationCut) => void;
}

export function SortableCutItem({ cut, displayIndex, isSelected, onRemove, onOpenDetail }: SortableCutItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cut.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasSynopsis = !!cut.cut_synopsis;
  const hasPrompts = !!(cut.gemini_colorize_prompt || cut.video_prompt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg overflow-hidden border-2 transition-colors cursor-pointer
        ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border'}
        ${isDragging ? 'z-50 shadow-lg' : ''}`}
      onClick={() => onOpenDetail?.(cut)}
    >
      <div className="absolute top-1 left-1 z-10 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
        {displayIndex}
      </div>

      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onRemove(cut.id); }}
        className="absolute top-1 right-1 z-10 bg-destructive/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <img
        src={cut.file_path}
        alt={cut.file_name}
        className="w-full h-32 object-cover"
        draggable={false}
      />

      {/* 기획/프롬프트 상태 뱃지 */}
      <div className="absolute bottom-1 left-1 flex gap-1">
        {hasSynopsis && (
          <span className="bg-blue-500/80 text-white text-[10px] px-1 py-0.5 rounded font-mono leading-none">기획</span>
        )}
        {hasPrompts && (
          <span className="bg-green-500/80 text-white text-[10px] px-1 py-0.5 rounded font-mono leading-none">P</span>
        )}
      </div>
    </div>
  );
}
