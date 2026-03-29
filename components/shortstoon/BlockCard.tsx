'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Copy, Trash2, CheckCircle, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShortstoonBlock,
  SHORTSTOON_EFFECT_LABELS,
  SHORTSTOON_TRANSITION_LABELS,
} from '@/lib/supabase';

interface BlockCardProps {
  block: ShortstoonBlock;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

const STATUS_ICON = {
  pending: <Clock className="h-3 w-3 text-muted-foreground" />,
  rendering: <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />,
  completed: <CheckCircle className="h-3 w-3 text-green-500" />,
  failed: <AlertCircle className="h-3 w-3 text-destructive" />,
};

export function BlockCard({ block, index, isSelected, onSelect, onCopy, onDelete }: BlockCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-border/80 hover:bg-muted/30'
      }`}
      onClick={onSelect}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="mt-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* 썸네일 */}
      <div className="flex-shrink-0 w-12 h-[85px] rounded overflow-hidden bg-muted">
        <img
          src={block.image_url}
          alt={block.file_name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
          {STATUS_ICON[block.status]}
          {block.status === 'failed' && (
            <span className="text-xs text-destructive truncate">{block.error_message}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {(block.duration_ms / 1000).toFixed(1)}초
          {block.effect_type !== 'none' && (
            <span className="ml-1 text-primary/70">· {SHORTSTOON_EFFECT_LABELS[block.effect_type]}</span>
          )}
        </div>
        {block.transition_type !== 'none' && (
          <Badge variant="outline" className="text-[10px] h-4 px-1">
            → {SHORTSTOON_TRANSITION_LABELS[block.transition_type]}
          </Badge>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-col gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="복사"
          onClick={onCopy}
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          title="삭제"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
