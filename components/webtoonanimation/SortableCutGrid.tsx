'use client';

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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { WebtoonAnimationCut } from '@/lib/supabase';
import { SortableCutItem } from './SortableCutItem';

interface SortableCutGridProps {
  cuts: WebtoonAnimationCut[];
  rangeStart: number;
  rangeEnd: number;
  onReorder: (newCuts: WebtoonAnimationCut[]) => void;
  onRemove: (id: string) => void;
  onOpenDetail?: (cut: WebtoonAnimationCut) => void;
}

export function SortableCutGrid({ cuts, rangeStart, rangeEnd, onReorder, onRemove, onOpenDetail }: SortableCutGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = cuts.findIndex((c) => c.id === active.id);
      const newIndex = cuts.findIndex((c) => c.id === over.id);
      onReorder(arrayMove(cuts, oldIndex, newIndex));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={cuts.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {cuts.map((cut, i) => (
            <SortableCutItem
              key={cut.id}
              cut={cut}
              displayIndex={i}
              isSelected={i >= rangeStart && i <= rangeEnd}
              onRemove={onRemove}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
