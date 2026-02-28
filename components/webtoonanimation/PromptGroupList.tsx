'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { WebtoonAnimationPromptGroup } from '@/lib/supabase';

interface PromptGroupListProps {
  groups: WebtoonAnimationPromptGroup[];
  activeGroupId: string | null;
  onSelect: (group: WebtoonAnimationPromptGroup) => void;
  onDelete: (id: string) => void;
}

export function PromptGroupList({ groups, activeGroupId, onSelect, onDelete }: PromptGroupListProps) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">생성 이력</h3>
      <div className="space-y-1.5">
        {groups.map((g) => (
          <Card
            key={g.id}
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${
              activeGroupId === g.id ? 'ring-2 ring-primary bg-accent' : ''
            }`}
            onClick={() => onSelect(g)}
          >
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">
                  컷 {g.range_start}~{g.range_end}
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  {g.aspect_ratio} · {g.video_duration || 10}초
                </span>
                <span className="text-xs text-muted-foreground ml-2">
                  {new Date(g.created_at).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(g.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
