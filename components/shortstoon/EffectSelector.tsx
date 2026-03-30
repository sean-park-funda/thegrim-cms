'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  ShortstoonEffectType,
  ShortstoonTransitionType,
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
  aiMotionEnabled: boolean;
  aiMotionParams: { motion_type: string; prompt: string };
  onAiMotionChange: (enabled: boolean, params: { motion_type: string; prompt: string }) => void;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

// 효과 칩 정의 (AI 모션 제외 — 별도 섹션)
const EFFECT_CHIPS: { icon: string; label: string; type: ShortstoonEffectType; params: Record<string, unknown> }[] = [
  { icon: '—',  label: '없음',     type: 'none',      params: {} },
  { icon: '←',  label: '좌 스크롤', type: 'scroll_h',  params: { direction: 'left',  amount: 0.5 } },
  { icon: '→',  label: '우 스크롤', type: 'scroll_h',  params: { direction: 'right', amount: 0.5 } },
  { icon: '↑',  label: '상 스크롤', type: 'scroll_v',  params: { direction: 'up',    amount: 0.5 } },
  { icon: '↓',  label: '하 스크롤', type: 'scroll_v',  params: { direction: 'down',  amount: 0.5 } },
  { icon: '🔍', label: '줌 인',    type: 'zoom_in',   params: { delta: 0.3 } },
  { icon: '🔎', label: '줌 아웃',  type: 'zoom_out',  params: { delta: 0.3 } },
  { icon: '〜', label: '흔들기',   type: 'shake',     params: { amplitude: 8, frequency: 8 } },
  { icon: '✦',  label: '번쩍임',   type: 'flash',     params: { interval: 0.5, min_brightness: 0.6 } },
];

function isChipActive(chip: typeof EFFECT_CHIPS[number], effectType: ShortstoonEffectType, effectParams: Record<string, unknown>) {
  if (chip.type !== effectType) return false;
  if (chip.type === 'scroll_h') return (effectParams.direction ?? 'left') === chip.params.direction;
  if (chip.type === 'scroll_v') return (effectParams.direction ?? 'up')   === chip.params.direction;
  return true;
}

export function EffectSelector({
  effectType, effectParams, durationMs,
  onChange, onDurationChange,
  aiMotionEnabled, aiMotionParams, onAiMotionChange,
}: EffectSelectorProps) {
  const setParam = (key: string, value: unknown) => onChange(effectType, { ...effectParams, [key]: value });

  return (
    <div className="space-y-5">

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

      {/* 효과 종류 */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">효과</p>
        <div className="grid grid-cols-5 gap-1.5">
          {EFFECT_CHIPS.map(chip => (
            <Chip
              key={`${chip.type}-${String(chip.params.direction ?? '')}`}
              active={isChipActive(chip, effectType, effectParams)}
              onClick={() => onChange(chip.type, chip.params)}
            >
              <span className="text-sm leading-none">{chip.icon}</span>
              <span className="text-[10px] leading-tight text-center">{chip.label}</span>
            </Chip>
          ))}
        </div>
      </div>

      {/* ── 효과별 파라미터 ── */}

      {/* 스크롤 크기 */}
      {(effectType === 'scroll_h' || effectType === 'scroll_v') && (
        <SliderParam
          label="스크롤 크기" unit="%"
          min={10} max={100} step={5}
          value={Math.round(((effectParams.amount as number) ?? 0.5) * 100)}
          display={String(Math.round(((effectParams.amount as number) ?? 0.5) * 100))}
          onChange={v => setParam('amount', v / 100)}
        />
      )}

      {/* 줌 차이 */}
      {(effectType === 'zoom_in' || effectType === 'zoom_out') && (
        <SliderParam
          label="줌 차이" unit="x"
          min={1} max={30} step={1}
          value={Math.round(((effectParams.delta as number) ?? 0.3) * 10)}
          display={((effectParams.delta as number) ?? 0.3).toFixed(1)}
          onChange={v => setParam('delta', v / 10)}
        />
      )}

      {/* 흔들기 */}
      {effectType === 'shake' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-2">속도</p>
            <div className="flex gap-1.5">
              <PillBtn wide active={(effectParams.frequency as number) >= 12} onClick={() => setParam('frequency', 15)}>빠르게</PillBtn>
              <PillBtn wide active={((effectParams.frequency as number) ?? 8) < 12} onClick={() => setParam('frequency', 4)}>천천히</PillBtn>
            </div>
          </div>
          <SliderParam
            label="진폭" unit="px"
            min={1} max={30} step={1}
            value={(effectParams.amplitude as number) ?? 8}
            display={String((effectParams.amplitude as number) ?? 8)}
            onChange={v => setParam('amplitude', v)}
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

      {/* ── AI 모션 섹션 ── */}
      <div className="border-t border-border pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <span>✨</span> AI 모션
          </p>
          <Switch
            checked={aiMotionEnabled}
            onCheckedChange={enabled => onAiMotionChange(enabled, aiMotionParams)}
          />
        </div>

        {aiMotionEnabled && (
          <div className="space-y-3">
            {effectType !== 'none' && (
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2.5 py-1.5">
                {effectTypeLabel(effectType, effectParams)} 효과를 프롬프트 힌트로 활용합니다
              </p>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-2">모션 종류</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([['blink','눈 깜빡임'],['hair','머리 흔들림'],['breathing','호흡'],['lip_sync','입 움직임'],['custom','커스텀']] as [string, string][]).map(([val, label]) => (
                  <PillBtn key={val} active={aiMotionParams.motion_type === val}
                    onClick={() => onAiMotionChange(true, { ...aiMotionParams, motion_type: val })}>
                    {label}
                  </PillBtn>
                ))}
              </div>
            </div>
            {aiMotionParams.motion_type === 'custom' && (
              <div>
                <Label className="text-xs text-muted-foreground">커스텀 프롬프트</Label>
                <Input
                  className="mt-1 h-8 text-xs"
                  placeholder="영어 프롬프트..."
                  value={aiMotionParams.prompt}
                  onChange={e => onAiMotionChange(true, { ...aiMotionParams, prompt: e.target.value })}
                />
              </div>
            )}
            <p className="text-[11px] text-amber-500/80 bg-amber-500/10 rounded-md px-2.5 py-1.5">
              렌더링 시 Wan2.2 AI 영상 생성 (수 분 소요)
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

function effectTypeLabel(type: ShortstoonEffectType, params: Record<string, unknown>): string {
  const dir = params.direction as string;
  const map: Partial<Record<ShortstoonEffectType, string>> = {
    scroll_h: dir === 'right' ? '우 스크롤' : '좌 스크롤',
    scroll_v: dir === 'down' ? '하 스크롤' : '상 스크롤',
    zoom_in: '줌 인',
    zoom_out: '줌 아웃',
    shake: '흔들기',
    flash: '번쩍임',
  };
  return map[type] ?? '';
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
