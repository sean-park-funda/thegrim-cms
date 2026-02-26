'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export type Pace = 'slow' | 'normal' | 'fast';

const PACE_OPTIONS: { value: Pace; label: string; desc: string }[] = [
  { value: 'slow', label: '느린', desc: '감성적, 긴 호흡' },
  { value: 'normal', label: '보통', desc: '균형잡힌 전개' },
  { value: 'fast', label: '빠른', desc: '액션, 짧은 컷' },
];

interface RangeSelectorProps {
  totalCuts: number;
  rangeStart: number;
  rangeEnd: number;
  pace: Pace;
  onRangeChange: (start: number, end: number) => void;
  onPaceChange: (pace: Pace) => void;
  onGenerate: () => void;
  generating: boolean;
}

export function RangeSelector({
  totalCuts,
  rangeStart,
  rangeEnd,
  pace,
  onRangeChange,
  onPaceChange,
  onGenerate,
  generating,
}: RangeSelectorProps) {
  const maxIndex = Math.max(0, totalCuts - 1);

  const handleStartChange = (val: string) => {
    const n = Math.max(0, Math.min(parseInt(val) || 0, rangeEnd));
    onRangeChange(n, rangeEnd);
  };

  const handleEndChange = (val: string) => {
    const n = Math.max(rangeStart, Math.min(parseInt(val) || 0, maxIndex));
    onRangeChange(rangeStart, n);
  };

  const selectAll = () => onRangeChange(0, maxIndex);

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex items-end gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">시작 컷</Label>
          <Input
            type="number"
            min={0}
            max={rangeEnd}
            value={rangeStart}
            onChange={(e) => handleStartChange(e.target.value)}
            className="w-20 h-9"
          />
        </div>
        <span className="text-muted-foreground pb-2">~</span>
        <div>
          <Label className="text-xs text-muted-foreground">끝 컷</Label>
          <Input
            type="number"
            min={rangeStart}
            max={maxIndex}
            value={rangeEnd}
            onChange={(e) => handleEndChange(e.target.value)}
            className="w-20 h-9"
          />
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={selectAll} className="h-9">
        전체 선택
      </Button>

      <span className="text-xs text-muted-foreground pb-2">
        {rangeEnd - rangeStart + 1}컷 선택됨
      </span>

      {/* 전개 속도 */}
      <div>
        <Label className="text-xs text-muted-foreground">전개 속도</Label>
        <div className="flex h-9 rounded-md border overflow-hidden">
          {PACE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPaceChange(opt.value)}
              className={`px-3 text-xs font-medium transition-colors border-r last:border-r-0
                ${pace === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent text-muted-foreground'
                }`}
              title={opt.desc}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        onClick={onGenerate}
        disabled={generating || totalCuts === 0}
        className="h-9 ml-auto"
      >
        <Sparkles className="h-4 w-4 mr-1.5" />
        {generating ? '생성 중...' : '프롬프트 생성'}
      </Button>
    </div>
  );
}
