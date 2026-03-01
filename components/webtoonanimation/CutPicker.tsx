'use client';

import { useRef } from 'react';
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
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { WebtoonAnimationCut } from '@/lib/supabase';
import type { InputMode } from '@/lib/video-generation/providers';
import { ArrowRight, Plus, Loader2, X, GripVertical } from 'lucide-react';

interface CutPickerProps {
  cuts: WebtoonAnimationCut[];
  inputMode: InputMode;
  maxImages?: number;
  selectedIndices: number[];
  onSelectionChange: (indices: number[]) => void;
  rangeStart: number;
  rangeEnd: number;
  onFilesSelected?: (files: File[]) => void;
  uploading?: boolean;
  onReorder?: (newCuts: WebtoonAnimationCut[]) => void;
  onRemove?: (cutId: string) => void;
}

function SortableCutThumb({
  cut,
  isSelected,
  label,
  onClick,
  onRemove,
}: {
  cut: WebtoonAnimationCut;
  isSelected: boolean;
  label: string | null;
  onClick: () => void;
  onRemove?: (cutId: string) => void;
}) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all group',
        'w-20 h-28',
        isSelected
          ? 'border-primary ring-2 ring-primary/30'
          : 'border-border hover:border-muted-foreground',
        isDragging && 'z-50 shadow-lg'
      )}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-0.5 left-1/2 -translate-x-1/2 z-10 bg-black/50 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      {/* Delete button */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(cut.id); }}
          className="absolute top-0.5 right-0.5 z-10 bg-destructive/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {/* Clickable image area */}
      <button
        onClick={onClick}
        className="w-full h-full"
      >
        <img
          src={cut.file_path}
          alt={`컷 ${cut.order_index}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </button>

      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5 pointer-events-none">
        {cut.order_index}
      </span>
      {label && (
        <span className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold text-center py-0.5 pointer-events-none">
          {label}
        </span>
      )}
    </div>
  );
}

export function CutPicker({
  cuts,
  inputMode,
  maxImages = 4,
  selectedIndices,
  onSelectionChange,
  rangeStart,
  rangeEnd,
  onFilesSelected,
  uploading,
  onReorder,
  onRemove,
}: CutPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rangeCuts = cuts
    .filter((c) => c.order_index >= rangeStart && c.order_index <= rangeEnd)
    .sort((a, b) => a.order_index - b.order_index);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleClick = (index: number) => {
    if (inputMode === 'single_image') {
      onSelectionChange([index]);
    } else if (inputMode === 'start_end_frame') {
      if (selectedIndices.length === 0) {
        onSelectionChange([index]);
      } else if (selectedIndices.length === 1) {
        const sorted = [selectedIndices[0], index].sort((a, b) => a - b);
        onSelectionChange(sorted);
      } else {
        onSelectionChange([index]);
      }
    } else {
      // multi_reference
      if (selectedIndices.includes(index)) {
        onSelectionChange(selectedIndices.filter((i) => i !== index));
      } else if (selectedIndices.length < maxImages) {
        onSelectionChange([...selectedIndices, index].sort((a, b) => a - b));
      }
    }
  };

  const getLabel = (index: number): string | null => {
    if (inputMode === 'start_end_frame') {
      if (selectedIndices[0] === index) return 'START';
      if (selectedIndices[1] === index) return 'END';
    }
    if (inputMode === 'multi_reference') {
      const pos = selectedIndices.indexOf(index);
      if (pos >= 0) return `${pos + 1}`;
    }
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cuts.findIndex((c) => c.id === active.id);
      const newIndex = cuts.findIndex((c) => c.id === over.id);
      onReorder(arrayMove(cuts, oldIndex, newIndex));
    }
  };

  const cutList = (
    <>
      {rangeCuts.map((cut) => {
        const isSelected = selectedIndices.includes(cut.order_index);
        const label = getLabel(cut.order_index);

        return (
          <SortableCutThumb
            key={cut.id}
            cut={cut}
            isSelected={isSelected}
            label={label}
            onClick={() => handleClick(cut.order_index)}
            onRemove={onRemove}
          />
        );
      })}
      {onFilesSelected && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                onFilesSelected(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={cn(
              'flex-shrink-0 rounded-lg border-2 border-dashed w-20 h-28',
              'flex flex-col items-center justify-center gap-1 transition-all',
              uploading
                ? 'border-muted opacity-50 cursor-not-allowed'
                : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
            )}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            ) : (
              <Plus className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="text-[10px] text-muted-foreground">추가</span>
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          {inputMode === 'single_image' && '컷 1개 선택'}
          {inputMode === 'start_end_frame' && '시작/끝 컷 2개 선택'}
          {inputMode === 'multi_reference' && `컷 최대 ${maxImages}개 선택`}
        </span>
        {selectedIndices.length > 0 && (
          <span className="text-xs">
            ({selectedIndices.map((i) => `컷${i}`).join(' → ')})
          </span>
        )}
      </div>
      {onReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rangeCuts.map((c) => c.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-2 overflow-x-auto pb-2">
              {cutList}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {cutList}
        </div>
      )}
      {inputMode === 'start_end_frame' && selectedIndices.length === 2 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
          <span>컷 {selectedIndices[0]}</span>
          <ArrowRight className="w-3 h-3" />
          <span>컷 {selectedIndices[1]}</span>
        </div>
      )}
    </div>
  );
}
