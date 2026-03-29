'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShortstoonEffectType,
  ShortstoonTransitionType,
  SHORTSTOON_EFFECT_LABELS,
  SHORTSTOON_TRANSITION_LABELS,
} from '@/lib/supabase';

// ─── 효과 선택 ────────────────────────────────────────────────────────────────

interface EffectSelectorProps {
  effectType: ShortstoonEffectType;
  effectParams: Record<string, unknown>;
  durationMs: number;
  onChange: (type: ShortstoonEffectType, params: Record<string, unknown>) => void;
  onDurationChange: (ms: number) => void;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

// 효과별 기본 파라미터
function defaultParams(type: ShortstoonEffectType): Record<string, unknown> {
  switch (type) {
    case 'scroll_h': return { direction: 'left', speed: 0.3 };
    case 'scroll_v': return { direction: 'up', speed: 0.3 };
    case 'zoom_in':  return { from: 1.0, to: 1.3 };
    case 'zoom_out': return { from: 1.3, to: 1.0 };
    case 'shake':    return { amplitude: 8, frequency: 8 };
    case 'flash':    return { interval: 0.5, min_brightness: 0.6 };
    case 'ai_motion': return { motion_type: 'blink', prompt: '' };
    default:          return {};
  }
}

export function EffectSelector({ effectType, effectParams, durationMs, onChange, onDurationChange }: EffectSelectorProps) {
  const handleTypeChange = (val: string) => {
    const type = val as ShortstoonEffectType;
    onChange(type, defaultParams(type));
  };

  const setParam = (key: string, value: unknown) => {
    onChange(effectType, { ...effectParams, [key]: value });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* 효과 종류 */}
        <div className="space-y-1">
          <Label className="text-xs">효과</Label>
          <Select value={effectType} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SHORTSTOON_EFFECT_LABELS) as ShortstoonEffectType[]).map(key => (
                <SelectItem key={key} value={key} className="text-xs">
                  {SHORTSTOON_EFFECT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 재생 시간 */}
        <div className="space-y-1">
          <Label className="text-xs">재생 시간</Label>
          <Select
            value={String(durationMs / 1000)}
            onValueChange={v => onDurationChange(Number(v) * 1000)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(s => (
                <SelectItem key={s} value={String(s)} className="text-xs">
                  {s}초
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 효과 파라미터 */}
      {effectType === 'scroll_h' && (
        <div className="space-y-1">
          <Label className="text-xs">방향</Label>
          <Select value={(effectParams.direction as string) ?? 'left'} onValueChange={v => setParam('direction', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">왼쪽 → 오른쪽</SelectItem>
              <SelectItem value="right" className="text-xs">오른쪽 → 왼쪽</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {effectType === 'scroll_v' && (
        <div className="space-y-1">
          <Label className="text-xs">방향</Label>
          <Select value={(effectParams.direction as string) ?? 'up'} onValueChange={v => setParam('direction', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="up" className="text-xs">위 → 아래</SelectItem>
              <SelectItem value="down" className="text-xs">아래 → 위</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {(effectType === 'zoom_in' || effectType === 'zoom_out') && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">시작 배율</Label>
            <Input
              type="number" step="0.1" min="1" max="5"
              className="h-8 text-xs"
              value={(effectParams.from as number) ?? 1.0}
              onChange={e => setParam('from', parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">끝 배율</Label>
            <Input
              type="number" step="0.1" min="1" max="5"
              className="h-8 text-xs"
              value={(effectParams.to as number) ?? 1.3}
              onChange={e => setParam('to', parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      {effectType === 'shake' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">진폭 (px)</Label>
            <Input
              type="number" step="1" min="1" max="30"
              className="h-8 text-xs"
              value={(effectParams.amplitude as number) ?? 8}
              onChange={e => setParam('amplitude', parseInt(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">주파수 (Hz)</Label>
            <Input
              type="number" step="1" min="1" max="30"
              className="h-8 text-xs"
              value={(effectParams.frequency as number) ?? 8}
              onChange={e => setParam('frequency', parseInt(e.target.value))}
            />
          </div>
        </div>
      )}

      {effectType === 'flash' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">간격 (초)</Label>
            <Input
              type="number" step="0.1" min="0.1" max="2"
              className="h-8 text-xs"
              value={(effectParams.interval as number) ?? 0.5}
              onChange={e => setParam('interval', parseFloat(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">최소 밝기</Label>
            <Input
              type="number" step="0.1" min="0" max="0.9"
              className="h-8 text-xs"
              value={(effectParams.min_brightness as number) ?? 0.6}
              onChange={e => setParam('min_brightness', parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      {effectType === 'ai_motion' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">AI 모션 종류</Label>
            <Select value={(effectParams.motion_type as string) ?? 'blink'} onValueChange={v => setParam('motion_type', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="blink" className="text-xs">눈 깜빡임</SelectItem>
                <SelectItem value="hair" className="text-xs">머리 흔들림</SelectItem>
                <SelectItem value="breathing" className="text-xs">호흡</SelectItem>
                <SelectItem value="lip_sync" className="text-xs">입 움직임</SelectItem>
                <SelectItem value="custom" className="text-xs">커스텀 프롬프트</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(effectParams.motion_type as string) === 'custom' && (
            <div className="space-y-1">
              <Label className="text-xs">커스텀 프롬프트</Label>
              <Input
                className="h-8 text-xs"
                placeholder="영어 프롬프트 입력..."
                value={(effectParams.prompt as string) ?? ''}
                onChange={e => setParam('prompt', e.target.value)}
              />
            </div>
          )}
          <p className="text-xs text-amber-500">
            AI 모션은 렌더링 시 Wan2.2 API를 호출합니다 (수 분 소요)
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 트랜지션 선택 ─────────────────────────────────────────────────────────────

interface TransitionSelectorProps {
  transitionType: ShortstoonTransitionType;
  transitionDurationMs: number;
  onChange: (type: ShortstoonTransitionType, durationMs: number) => void;
}

const TRANSITION_DURATION_OPTIONS = [300, 500, 800, 1000, 1500];

export function TransitionSelector({ transitionType, transitionDurationMs, onChange }: TransitionSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label className="text-xs">전환 효과</Label>
        <Select
          value={transitionType}
          onValueChange={v => onChange(v as ShortstoonTransitionType, transitionDurationMs)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SHORTSTOON_TRANSITION_LABELS) as ShortstoonTransitionType[]).map(key => (
              <SelectItem key={key} value={key} className="text-xs">
                {SHORTSTOON_TRANSITION_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {transitionType !== 'none' && (
        <div className="space-y-1">
          <Label className="text-xs">전환 시간</Label>
          <Select
            value={String(transitionDurationMs)}
            onValueChange={v => onChange(transitionType, Number(v))}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRANSITION_DURATION_OPTIONS.map(ms => (
                <SelectItem key={ms} value={String(ms)} className="text-xs">
                  {ms}ms
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
