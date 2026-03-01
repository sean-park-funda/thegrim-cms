'use client';

import { cn } from '@/lib/utils';
import type { WebtoonAnimationCut } from '@/lib/supabase';
import type { InputMode } from '@/lib/video-generation/providers';
import { ArrowRight } from 'lucide-react';

interface CutPickerProps {
  cuts: WebtoonAnimationCut[];
  inputMode: InputMode;
  maxImages?: number;
  selectedIndices: number[];
  onSelectionChange: (indices: number[]) => void;
  rangeStart: number;
  rangeEnd: number;
}

export function CutPicker({
  cuts,
  inputMode,
  maxImages = 4,
  selectedIndices,
  onSelectionChange,
  rangeStart,
  rangeEnd,
}: CutPickerProps) {
  const rangeCuts = cuts
    .filter((c) => c.order_index >= rangeStart && c.order_index <= rangeEnd)
    .sort((a, b) => a.order_index - b.order_index);

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
      <div className="flex gap-2 overflow-x-auto pb-2">
        {rangeCuts.map((cut) => {
          const isSelected = selectedIndices.includes(cut.order_index);
          const label = getLabel(cut.order_index);

          return (
            <button
              key={cut.id}
              onClick={() => handleClick(cut.order_index)}
              className={cn(
                'relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                'w-20 h-28 hover:opacity-90',
                isSelected
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-muted-foreground'
              )}
            >
              <img
                src={cut.file_path}
                alt={`컷 ${cut.order_index}`}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] text-center py-0.5">
                {cut.order_index}
              </span>
              {label && (
                <span className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold text-center py-0.5">
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
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
