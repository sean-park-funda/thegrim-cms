'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { cn } from '@/lib/utils';

// ─── 효과 선택 ────────────────────────────────────────────────────────────────

interface EffectSelectorProps {
  effectType: ShortstoonEffectType;
  effectParams: Record<string, unknown>;
  durationMs: number;
  onChange: (type: ShortstoonEffectType, params: Record<string, unknown>) => void;
  onDurationChange: (ms: number) => void;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

const EFFECT_ICONS: Record<ShortstoonEffectType, string> = {
  none:      '—',
  scroll_h:  '↔',
  scroll_v:  '↕',
  zoom_in:   '🔍',
  zoom_out:  '🔎',
  shake:     '~',
  flash:     '✦',
  ai_motion: '✨',
};

function defaultParams(type: ShortstoonEffectType): Record<string, unknown> {
  switch (type) {
    case 'scroll_h':  return { direction: 'left', speed: 0.3 };
    case 'scroll_v':  return { direction: 'up', speed: 0.3 };
    case 'zoom_in':   return { from: 1.0, to: 1.3 };
    case 'zoom_out':  return { from: 1.3, to: 1.0 };
    case 'shake':     return { amplitude: 8, frequency: 8 };
    case 'flash':     return { interval: 0.5, min_brightness: 0.6 };
    case 'ai_motion': return { motion_type: 'blink', prompt: '' };
    default:          return {};
  }
}

export function EffectSelector({ effectType, effectParams, durationMs, onChange, onDurationChange }: EffectSelectorProps) {
  const handleTypeChange = (type: ShortstoonEffectType) => {
    onChange(type, defaultParams(type));
  };

  const setParam = (key: string, value: unknown) => {
    onChange(effectType, { ...effectParams, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* 효과 종류 — 칩 그리드 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">효과 종류</p>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(SHORTSTOON_EFFECT_LABELS) as ShortstoonEffectType[]).map(key => (
            <button
              key={key}
              onClick={() => handleTypeChange(key)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all',
                effectType === key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/60'
              )}
            >
              <span className="text-sm leading-none">{EFFECT_ICONS[key]}</span>
              <span className="leading-tight text-center">{SHORTSTOON_EFFECT_LABELS[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 재생 시간 — 가로 버튼 행 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">재생 시간</p>
        <div className="flex flex-wrap gap-1.5">
          {DURATION_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => onDurationChange(s * 1000)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                durationMs === s * 1000
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
              )}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>

      {/* 효과 파라미터 */}
      {(effectType === 'scroll_h' || effectType === 'scroll_v') && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">방향</p>
          <div className="flex gap-1.5">
            {effectType === 'scroll_h'
              ? [['left', '← 오른쪽으로'], ['right', '→ 왼쪽으로']].map(([val, label]) => (
                  <DirButton key={val} active={(effectParams.direction as string) === val} onClick={() => setParam('direction', val)}>
                    {label}
                  </DirButton>
                ))
              : [['up', '↑ 아래로'], ['down', '↓ 위로']].map(([val, label]) => (
                  <DirButton key={val} active={(effectParams.direction as string) === val} onClick={() => setParam('direction', val)}>
                    {label}
                  </DirButton>
                ))
            }
          </div>
        </div>
      )}

      {(effectType === 'zoom_in' || effectType === 'zoom_out') && (
        <div className="grid grid-cols-2 gap-3">
          <ParamInput label="시작 배율" step={0.1} min={1} max={5}
            value={(effectParams.from as number) ?? 1.0}
            onChange={v => setParam('from', v)} />
          <ParamInput label="끝 배율" step={0.1} min={1} max={5}
            value={(effectParams.to as number) ?? 1.3}
            onChange={v => setParam('to', v)} />
        </div>
      )}

      {effectType === 'shake' && (
        <div className="grid grid-cols-2 gap-3">
          <ParamInput label="진폭 (px)" step={1} min={1} max={30}
            value={(effectParams.amplitude as number) ?? 8}
            onChange={v => setParam('amplitude', v)} />
          <ParamInput label="주파수 (Hz)" step={1} min={1} max={30}
            value={(effectParams.frequency as number) ?? 8}
            onChange={v => setParam('frequency', v)} />
        </div>
      )}

      {effectType === 'flash' && (
        <div className="grid grid-cols-2 gap-3">
          <ParamInput label="간격 (초)" step={0.1} min={0.1} max={2}
            value={(effectParams.interval as number) ?? 0.5}
            onChange={v => setParam('interval', v)} />
          <ParamInput label="최소 밝기" step={0.1} min={0} max={0.9}
            value={(effectParams.min_brightness as number) ?? 0.6}
            onChange={v => setParam('min_brightness', v)} />
        </div>
      )}

      {effectType === 'ai_motion' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-2">AI 모션 종류</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ['blink', '눈 깜빡임'],
                ['hair', '머리 흔들림'],
                ['breathing', '호흡'],
                ['lip_sync', '입 움직임'],
                ['custom', '커스텀'],
              ].map(([val, label]) => (
                <DirButton
                  key={val}
                  active={(effectParams.motion_type as string) === val}
                  onClick={() => setParam('motion_type', val)}
                >
                  {label}
                </DirButton>
              ))}
            </div>
          </div>
          {(effectParams.motion_type as string) === 'custom' && (
            <div>
              <Label className="text-xs text-muted-foreground">커스텀 프롬프트</Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="영어 프롬프트 입력..."
                value={(effectParams.prompt as string) ?? ''}
                onChange={e => setParam('prompt', e.target.value)}
              />
            </div>
          )}
          <p className="text-[11px] text-amber-500/80 bg-amber-500/10 rounded-md px-2.5 py-1.5">
            렌더링 시 Wan2.2 API 호출 (수 분 소요)
          </p>
        </div>
      )}
    </div>
  );
}

function DirButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
      )}
    >
      {children}
    </button>
  );
}

function ParamInput({ label, step, min, max, value, onChange }: {
  label: string; step: number; min: number; max: number;
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number" step={step} min={min} max={max}
        className="h-8 text-xs"
        value={value}
        onChange={e => onChange(step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value))}
      />
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
    <div className="space-y-4">
      {/* 전환 효과 칩 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">전환 효과</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SHORTSTOON_TRANSITION_LABELS) as ShortstoonTransitionType[]).map(key => (
            <button
              key={key}
              onClick={() => onChange(key, transitionDurationMs)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                transitionType === key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
              )}
            >
              {SHORTSTOON_TRANSITION_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* 전환 시간 */}
      {transitionType !== 'none' && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">전환 시간</p>
          <div className="flex flex-wrap gap-1.5">
            {TRANSITION_DURATION_OPTIONS.map(ms => (
              <button
                key={ms}
                onClick={() => onChange(transitionType, ms)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                  transitionDurationMs === ms
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
                )}
              >
                {ms}ms
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
