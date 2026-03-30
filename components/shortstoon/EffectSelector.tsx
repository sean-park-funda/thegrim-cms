'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  shake:     '〜',
  flash:     '✦',
  ai_motion: '✨',
};

function defaultParams(type: ShortstoonEffectType): Record<string, unknown> {
  switch (type) {
    case 'scroll_h':  return { direction: 'left',  speed: 0.3 };
    case 'scroll_v':  return { direction: 'up',    speed: 0.3 };
    case 'zoom_in':   return { from: 1.0, to: 1.3 };
    case 'zoom_out':  return { from: 1.3, to: 1.0 };
    case 'shake':     return { amplitude: 8,  frequency: 8 };
    case 'flash':     return { interval: 0.5, min_brightness: 0.6 };
    case 'ai_motion': return { motion_type: 'blink', prompt: '' };
    default:          return {};
  }
}

export function EffectSelector({ effectType, effectParams, durationMs, onChange, onDurationChange }: EffectSelectorProps) {
  const setParam = (key: string, value: unknown) => onChange(effectType, { ...effectParams, [key]: value });

  return (
    <div className="space-y-5">

      {/* 효과 종류 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">효과</p>
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(SHORTSTOON_EFFECT_LABELS) as ShortstoonEffectType[]).map(key => (
            <Chip
              key={key}
              active={effectType === key}
              onClick={() => onChange(key, defaultParams(key))}
            >
              <span className="text-sm leading-none">{EFFECT_ICONS[key]}</span>
              <span className="text-[10px] leading-tight text-center">{SHORTSTOON_EFFECT_LABELS[key]}</span>
            </Chip>
          ))}
        </div>
      </div>

      {/* 재생 시간 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">재생 시간</p>
        <div className="flex flex-wrap gap-1.5">
          {DURATION_OPTIONS.map(s => (
            <PillBtn key={s} active={durationMs === s * 1000} onClick={() => onDurationChange(s * 1000)}>
              {s}s
            </PillBtn>
          ))}
        </div>
      </div>

      {/* ── 효과별 파라미터 ── */}

      {/* 좌우 스크롤 */}
      {effectType === 'scroll_h' && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">방향</p>
          <div className="flex gap-1.5">
            <PillBtn wide active={(effectParams.direction as string) === 'left'}  onClick={() => setParam('direction', 'left')}>← 좌</PillBtn>
            <PillBtn wide active={(effectParams.direction as string) === 'right'} onClick={() => setParam('direction', 'right')}>우 →</PillBtn>
          </div>
        </div>
      )}

      {/* 상하 스크롤 */}
      {effectType === 'scroll_v' && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">방향</p>
          <div className="flex gap-1.5">
            <PillBtn wide active={(effectParams.direction as string) === 'up'}   onClick={() => setParam('direction', 'up')}>↑ 상</PillBtn>
            <PillBtn wide active={(effectParams.direction as string) === 'down'} onClick={() => setParam('direction', 'down')}>하 ↓</PillBtn>
          </div>
        </div>
      )}

      {/* 줌인/줌아웃 */}
      {(effectType === 'zoom_in' || effectType === 'zoom_out') && (
        <div className="space-y-3">
          <SliderParam
            label="시작 배율" unit="x"
            min={10} max={50} step={1}
            value={Math.round(((effectParams.from as number) ?? 1.0) * 10)}
            display={((effectParams.from as number) ?? 1.0).toFixed(1)}
            onChange={v => setParam('from', v / 10)}
          />
          <SliderParam
            label="끝 배율" unit="x"
            min={10} max={50} step={1}
            value={Math.round(((effectParams.to as number) ?? 1.3) * 10)}
            display={((effectParams.to as number) ?? 1.3).toFixed(1)}
            onChange={v => setParam('to', v / 10)}
          />
        </div>
      )}

      {/* 흔들기 */}
      {effectType === 'shake' && (
        <div className="space-y-3">
          <SliderParam
            label="진폭" unit="px"
            min={1} max={30} step={1}
            value={(effectParams.amplitude as number) ?? 8}
            display={String((effectParams.amplitude as number) ?? 8)}
            onChange={v => setParam('amplitude', v)}
          />
          <SliderParam
            label="주파수" unit="Hz"
            min={1} max={30} step={1}
            value={(effectParams.frequency as number) ?? 8}
            display={String((effectParams.frequency as number) ?? 8)}
            onChange={v => setParam('frequency', v)}
          />
        </div>
      )}

      {/* 번쩍임 */}
      {effectType === 'flash' && (
        <div className="space-y-3">
          <SliderParam
            label="간격" unit="s"
            min={1} max={20} step={1}
            value={Math.round(((effectParams.interval as number) ?? 0.5) * 10)}
            display={((effectParams.interval as number) ?? 0.5).toFixed(1)}
            onChange={v => setParam('interval', v / 10)}
          />
          <SliderParam
            label="최소 밝기" unit=""
            min={0} max={9} step={1}
            value={Math.round(((effectParams.min_brightness as number) ?? 0.6) * 10)}
            display={((effectParams.min_brightness as number) ?? 0.6).toFixed(1)}
            onChange={v => setParam('min_brightness', v / 10)}
          />
        </div>
      )}

      {/* AI 모션 */}
      {effectType === 'ai_motion' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-2">모션 종류</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[['blink','눈 깜빡임'],['hair','머리 흔들림'],['breathing','호흡'],['lip_sync','입 움직임'],['custom','커스텀']].map(([val, label]) => (
                <PillBtn key={val} active={(effectParams.motion_type as string) === val} onClick={() => setParam('motion_type', val)}>
                  {label}
                </PillBtn>
              ))}
            </div>
          </div>
          {(effectParams.motion_type as string) === 'custom' && (
            <div>
              <Label className="text-xs text-muted-foreground">커스텀 프롬프트</Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="영어 프롬프트..."
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
      <div>
        <p className="text-xs text-muted-foreground mb-2">전환 효과</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SHORTSTOON_TRANSITION_LABELS) as ShortstoonTransitionType[]).map(key => (
            <PillBtn key={key} active={transitionType === key} onClick={() => onChange(key, transitionDurationMs)}>
              {SHORTSTOON_TRANSITION_LABELS[key]}
            </PillBtn>
          ))}
        </div>
      </div>
      {transitionType !== 'none' && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">전환 시간</p>
          <div className="flex flex-wrap gap-1.5">
            {TRANSITION_DURATION_OPTIONS.map(ms => (
              <PillBtn key={ms} active={transitionDurationMs === ms} onClick={() => onChange(transitionType, ms)}>
                {ms}ms
              </PillBtn>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 공통 컴포넌트 ─────────────────────────────────────────────────────────────

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border text-[10px] font-medium transition-all',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/60'
      )}
    >
      {children}
    </button>
  );
}

function PillBtn({ active, onClick, children, wide }: { active: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-md text-xs font-medium border transition-all',
        wide && 'flex-1',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-muted/30 text-muted-foreground hover:border-border/80 hover:bg-muted/50'
      )}
    >
      {children}
    </button>
  );
}

function SliderParam({ label, unit, min, max, step, value, display, onChange }: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; display: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">{display}{unit}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
