'use client';

import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ShortstoonEffectType,
  ShortstoonTransitionType,
  SHORTSTOON_TRANSITION_LABELS,
} from '@/lib/supabase';
import { cn } from '@/lib/utils';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

// Lightsail comfyui.py의 MOTION_PROMPTS와 동일
const MOTION_PROMPTS: Record<string, string> = {
  blink:     'Natural eye blinking, subtle facial micro-expressions, slight head sway',
  breathing: 'Gentle chest rise and fall with slow breathing, subtle body movement',
  hair:      'Hair sways gently in a light breeze, soft flowing motion',
  lip_sync:  'Lips move naturally as if speaking softly, subtle jaw movement',
};

// Lightsail comfyui.py의 BASE_EFFECT_HINTS와 동일
const EFFECT_HINTS: Partial<Record<ShortstoonEffectType, string>> = {
  scroll_h: 'with subtle horizontal panning movement',
  scroll_v: 'with subtle vertical panning movement',
  zoom_in:  'with a slow gentle zoom in toward the subject',
  zoom_out: 'with a slow gentle zoom out from the subject',
  shake:    'with slight camera shake and trembling',
  flash:    'with flickering light changes',
};

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

const MOTION_LABELS: [string, string][] = [
  ['blink', '눈 깜빡임'],
  ['hair', '머리 흔들림'],
  ['breathing', '호흡'],
  ['lip_sync', '입 움직임'],
  ['custom', '커스텀'],
];

export function EffectSelector({
  effectType, effectParams, durationMs,
  onChange, onDurationChange,
  aiMotionEnabled, aiMotionParams, onAiMotionChange,
}: EffectSelectorProps) {
  const setParam = (key: string, value: unknown) => onChange(effectType, { ...effectParams, [key]: value });

  const [koreanInput, setKoreanInput] = useState('');
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!koreanInput.trim()) return;
    setTranslating(true);
    try {
      const res = await fetch('/api/shortstoon/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: koreanInput }),
      });
      const { translated } = await res.json();
      if (translated) onAiMotionChange(true, { ...aiMotionParams, prompt: translated });
    } finally {
      setTranslating(false);
    }
  };

  // AI 렌더링 시 최종 합성 프롬프트
  const motionPrompt = aiMotionParams.motion_type === 'custom'
    ? aiMotionParams.prompt
    : MOTION_PROMPTS[aiMotionParams.motion_type] ?? '';
  const effectHint = EFFECT_HINTS[effectType] ?? '';
  const finalPrompt = [motionPrompt, effectHint].filter(Boolean).join(', ');

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

      {(effectType === 'scroll_h' || effectType === 'scroll_v') && (
        <SliderParam
          label="스크롤 크기" unit="%"
          min={10} max={100} step={5}
          value={Math.round(((effectParams.amount as number) ?? 0.5) * 100)}
          display={String(Math.round(((effectParams.amount as number) ?? 0.5) * 100))}
          onChange={v => setParam('amount', v / 100)}
        />
      )}

      {(effectType === 'zoom_in' || effectType === 'zoom_out') && (
        <SliderParam
          label="줌 차이" unit="x"
          min={1} max={30} step={1}
          value={Math.round(((effectParams.delta as number) ?? 0.3) * 10)}
          display={((effectParams.delta as number) ?? 0.3).toFixed(1)}
          onChange={v => setParam('delta', v / 10)}
        />
      )}

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

            {/* 모션 종류 */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">모션</p>
              <div className="grid grid-cols-3 gap-1.5">
                {MOTION_LABELS.map(([val, label]) => (
                  <PillBtn key={val} active={aiMotionParams.motion_type === val}
                    onClick={() => onAiMotionChange(true, { ...aiMotionParams, motion_type: val })}>
                    {label}
                  </PillBtn>
                ))}
              </div>
            </div>

            {/* 커스텀: 한글 입력 + 번역 */}
            {aiMotionParams.motion_type === 'custom' && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">한글로 동작 설명</p>
                <div className="flex gap-1.5">
                  <textarea
                    className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                    rows={2}
                    placeholder="예: 눈을 천천히 깜빡이며 고개를 살짝 돌린다"
                    value={koreanInput}
                    onChange={e => setKoreanInput(e.target.value)}
                  />
                  <button
                    onClick={handleTranslate}
                    disabled={translating || !koreanInput.trim()}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium border transition-all self-start',
                      translating || !koreanInput.trim()
                        ? 'border-border text-muted-foreground opacity-50 cursor-not-allowed'
                        : 'border-primary text-primary hover:bg-primary/10'
                    )}
                  >
                    {translating ? '...' : '번역'}
                  </button>
                </div>
                {aiMotionParams.prompt && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">번역된 프롬프트 (수정 가능)</p>
                    <textarea
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground/80"
                      rows={2}
                      value={aiMotionParams.prompt}
                      onChange={e => onAiMotionChange(true, { ...aiMotionParams, prompt: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 최종 프롬프트 미리보기 */}
            <div className="rounded-md bg-muted/40 border border-border/60 px-2.5 py-2 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">최종 AI 프롬프트</p>
              {motionPrompt && (
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">액션</span>
                  <p className="text-[11px] text-foreground/70 leading-snug">{motionPrompt}</p>
                </div>
              )}
              {effectHint && (
                <div className="space-y-0.5">
                  <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">이펙트</span>
                  <p className="text-[11px] text-foreground/70 leading-snug">{effectHint}</p>
                </div>
              )}
              {!finalPrompt && (
                <p className="text-[11px] text-muted-foreground/50 italic">모션을 선택하세요</p>
              )}
            </div>

            <p className="text-[11px] text-amber-500/80 bg-amber-500/10 rounded-md px-2.5 py-1.5">
              렌더링 시 Wan2.2 AI 영상 생성 (수 분 소요)
            </p>
          </div>
        )}
      </div>

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
