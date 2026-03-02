'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Play, Sparkles, Loader2,
  Image, ArrowRightLeft, Images,
  Monitor, Cloud, Cpu,
  Wand2, ArrowRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WebtoonAnimationCut, WebtoonAnimationVideoTest } from '@/lib/supabase';
import type { ProviderCapabilities, InputMode } from '@/lib/video-generation/providers';
import { CutPicker } from './CutPicker';
import { VideoTestCard } from './VideoTestCard';

interface VideoTestLabProps {
  cuts: WebtoonAnimationCut[];
  projectId: string;
  rangeStart: number;
  rangeEnd: number;
  onFilesSelected?: (files: File[]) => void;
  uploading?: boolean;
  onReorder?: (newCuts: WebtoonAnimationCut[]) => void;
  onRemove?: (cutId: string) => void;
}

const INPUT_MODE_CONFIG: Record<InputMode, { label: string; icon: typeof Image; desc: string }> = {
  single_image: { label: '1장', icon: Image, desc: '단일 이미지' },
  start_end_frame: { label: 'S+E', icon: ArrowRightLeft, desc: '시작+끝 프레임' },
  multi_reference: { label: '다중', icon: Images, desc: '여러 프레임' },
};

const SAFETY_STYLE: Record<string, { label: string; dot: string; bg: string }> = {
  lenient: { label: '관대', dot: 'bg-green-500', bg: 'border-green-200 bg-green-50/50' },
  moderate: { label: '보통', dot: 'bg-yellow-500', bg: 'border-yellow-200 bg-yellow-50/50' },
  strict: { label: '엄격', dot: 'bg-red-500', bg: 'border-red-200 bg-red-50/50' },
};

const PLATFORM_ICON: Record<string, typeof Monitor> = {
  direct: Monitor,
  'fal.ai': Cloud,
  comfyui: Cpu,
};

export function VideoTestLab({ cuts, projectId, rangeStart, rangeEnd, onFilesSelected, uploading, onReorder, onRemove }: VideoTestLabProps) {
  const [providers, setProviders] = useState<ProviderCapabilities[]>([]);
  const [tests, setTests] = useState<WebtoonAnimationVideoTest[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [inputMode, setInputMode] = useState<InputMode>('single_image');
  const [selectedCuts, setSelectedCuts] = useState<number[]>([]);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [beforeFrameUrl, setBeforeFrameUrl] = useState<string | null>(null);
  const [beforeFrameCutIndex, setBeforeFrameCutIndex] = useState<number | null>(null);
  const [generatingBefore, setGeneratingBefore] = useState(false);
  const [beforeModel, setBeforeModel] = useState('gemini-3.1-flash-image-preview');
  const [beforePrompt, setBeforePrompt] = useState(
    `This webtoon/manhwa panel shows the RESULT of an action (impact, landing, collision, etc.).
Generate what this scene looked like exactly 0.5 seconds BEFORE this moment.

Rules:
- Show the anticipation/wind-up pose right before the action happens
- Use a front-facing camera angle
- Keep the EXACT same art style, line work, coloring, and character design
- Keep similar composition and framing
- No text, no speech bubbles, no sound effects
- The image should flow naturally into the given panel as an animation sequence`
  );

  const currentProvider = providers.find((p) => p.id === selectedProvider);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/webtoonanimation/video-tests?projectId=${projectId}`);
      const data = await res.json();
      setProviders(data.providers || []);
      setTests(data.tests || []);
      if (data.providers?.length && !selectedProvider) {
        setSelectedProvider(data.providers[0].id);
      }
    } catch (e) {
      console.error('Failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedProvider]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!currentProvider) return;
    if (!currentProvider.inputModes.includes(inputMode)) {
      setInputMode(currentProvider.inputModes[0]);
    }
    if (!currentProvider.durations.includes(duration)) {
      setDuration(currentProvider.durations[0]);
    }
    if (!currentProvider.aspectRatios.includes(aspectRatio)) {
      setAspectRatio(currentProvider.aspectRatios[0]);
    }
    setSelectedCuts([]);
  }, [selectedProvider]);

  // 컷 선택이 바뀌면 before frame 초기화
  useEffect(() => {
    if (beforeFrameCutIndex !== null && !selectedCuts.includes(beforeFrameCutIndex)) {
      setBeforeFrameUrl(null);
      setBeforeFrameCutIndex(null);
    }
  }, [selectedCuts, beforeFrameCutIndex]);

  const handleGenerateBefore = async () => {
    const targetCutIndex = selectedCuts[selectedCuts.length - 1] ?? selectedCuts[0];
    if (targetCutIndex === undefined) return;
    setGeneratingBefore(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-before-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cutIndex: targetCutIndex, model: beforeModel, prompt: beforePrompt }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setBeforeFrameUrl(data.imageUrl);
        setBeforeFrameCutIndex(targetCutIndex);
      } else {
        alert(data.error || '직전 프레임 생성 실패');
      }
    } catch (e) {
      console.error(e);
      alert('직전 프레임 생성 실패');
    } finally {
      setGeneratingBefore(false);
    }
  };

  const handleGeneratePrompt = async () => {
    if (!selectedCuts.length) return;
    setGeneratingPrompt(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cutIndices: selectedCuts, inputMode, provider: selectedProvider, duration }),
      });
      const data = await res.json();
      if (data.prompt) setPrompt(data.prompt);
      else alert(data.error || '프롬프트 생성 실패');
    } catch (e) {
      console.error(e);
      alert('프롬프트 생성 실패');
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedCuts.length || !selectedProvider) return;

    // 임시 ID로 placeholder 추가 (생성중 표시)
    const tempId = `temp-${Date.now()}`;
    const placeholder: WebtoonAnimationVideoTest = {
      id: tempId,
      project_id: projectId,
      provider: selectedProvider,
      input_mode: inputMode,
      prompt,
      input_cut_indices: selectedCuts,
      duration_seconds: duration,
      aspect_ratio: aspectRatio,
      status: 'generating',
      video_path: null,
      video_url: null,
      error_message: null,
      elapsed_ms: null,
      metadata: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTests((prev) => [placeholder, ...prev]);
    setGeneratingIds((prev) => new Set(prev).add(tempId));

    try {
      const res = await fetch('/api/webtoonanimation/generate-test-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, provider: selectedProvider, inputMode, cutIndices: selectedCuts, prompt, duration, aspectRatio, beforeFrameUrl }),
      });
      const data = await res.json();
      if (data.error) {
        // placeholder를 실패로 업데이트
        setTests((prev) => prev.map((t) => t.id === tempId ? { ...t, status: 'failed' as const, error_message: data.error } : t));
      } else {
        // placeholder를 실제 결과로 교체
        setTests((prev) => prev.map((t) => t.id === tempId ? data : t));
      }
    } catch (e) {
      console.error(e);
      setTests((prev) => prev.map((t) => t.id === tempId ? { ...t, status: 'failed' as const, error_message: '네트워크 오류' } : t));
    } finally {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(tempId); return next; });
    }
  };

  const handleDelete = async (testId: string) => {
    await fetch(`/api/webtoonanimation/video-tests?testId=${testId}`, { method: 'DELETE' });
    setTests((prev) => prev.filter((t) => t.id !== testId));
  };

  const handleRegenerate = (test: WebtoonAnimationVideoTest) => {
    setSelectedProvider(test.provider);
    setInputMode(test.input_mode as InputMode);
    setSelectedCuts(test.input_cut_indices);
    setPrompt(test.prompt);
    setDuration(test.duration_seconds);
    setAspectRatio(test.aspect_ratio);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 모델 선택 — 카드 그리드 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">모델</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {providers.map((p) => {
            const isActive = selectedProvider === p.id;
            const safety = SAFETY_STYLE[p.contentSafety];
            const PlatformIcon = PLATFORM_ICON[p.platform] || Cloud;
            const modeIcons = p.inputModes.map((m) => INPUT_MODE_CONFIG[m]);

            return (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p.id)}
                className={cn(
                  'relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all',
                  isActive
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
                )}
              >
                {/* 모델명 + 플랫폼 */}
                <div className="flex items-center gap-1.5 w-full">
                  <PlatformIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>

                {/* 입력 모드 아이콘 + 안전성 + 비용 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* 지원 모드 칩 */}
                  {modeIcons.map((m) => {
                    const MIcon = m.icon;
                    return (
                      <span
                        key={m.label}
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        title={m.desc}
                      >
                        <MIcon className="w-2.5 h-2.5" />
                        {m.label}
                      </span>
                    );
                  })}
                  {/* 안전성 */}
                  <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border', safety.bg)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', safety.dot)} />
                    {safety.label}
                  </span>
                </div>

                {/* 비용 + max 이미지 */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {p.costPerSec !== undefined && (
                    <span>{p.costPerSec === 0 ? 'Free' : `$${p.costPerSec}/s`}</span>
                  )}
                  {p.maxImages && p.maxImages > 1 && (
                    <span>max {p.maxImages}장</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 입력 모드 — 토글 버튼 */}
      {currentProvider && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">입력 모드</label>
          <div className="flex gap-2">
            {currentProvider.inputModes.map((mode) => {
              const cfg = INPUT_MODE_CONFIG[mode];
              const ModeIcon = cfg.icon;
              const isActive = inputMode === mode;
              const maxImg = mode === 'multi_reference' ? currentProvider.maxImages : mode === 'start_end_frame' ? 2 : 1;

              return (
                <button
                  key={mode}
                  onClick={() => { setInputMode(mode); setSelectedCuts([]); }}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all',
                    isActive
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'
                  )}
                >
                  <ModeIcon className="w-4 h-4" />
                  <div className="text-left">
                    <div>{cfg.desc}</div>
                    <div className="text-[10px] font-normal opacity-70">
                      {mode === 'single_image' && '컷 1장'}
                      {mode === 'start_end_frame' && '컷 2장 (시작→끝)'}
                      {mode === 'multi_reference' && `컷 최대 ${maxImg}장`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 컷 선택 */}
      <CutPicker
        cuts={cuts}
        inputMode={inputMode}
        maxImages={currentProvider?.maxImages || 4}
        selectedIndices={selectedCuts}
        onSelectionChange={setSelectedCuts}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onFilesSelected={onFilesSelected}
        uploading={uploading}
        onReorder={onReorder}
        onRemove={onRemove}
      />

      {/* 직전 프레임 생성 */}
      {selectedCuts.length > 0 && (
        <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">직전 프레임 생성</label>
          </div>

          {/* 모델 선택 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">이미지 생성 모델</label>
            <div className="flex gap-1 flex-wrap">
              {[
                { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash' },
                { id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro' },
                { id: 'gemini-2.0-flash-exp-image-generation', label: 'Gemini 2.0 Flash' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setBeforeModel(m.id)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-md border transition-all',
                    beforeModel === m.id
                      ? 'border-primary bg-primary/5 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* 프롬프트 */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">이미지 생성 프롬프트</label>
            <Textarea
              value={beforePrompt}
              onChange={(e) => setBeforePrompt(e.target.value)}
              placeholder="직전 프레임 생성 프롬프트..."
              rows={4}
              className="text-xs"
            />
          </div>

          {/* 생성 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateBefore}
            disabled={generatingBefore || !selectedCuts.length}
            className="w-full"
          >
            {generatingBefore ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3 mr-1" />
            )}
            {generatingBefore ? '생성 중...' : `컷 ${selectedCuts[selectedCuts.length - 1] ?? selectedCuts[0]} 직전 프레임 생성`}
          </Button>

          {/* 결과 미리보기 */}
          {beforeFrameUrl && beforeFrameCutIndex !== null && (
            <div className="relative flex items-center gap-2 p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
              <button
                onClick={() => { setBeforeFrameUrl(null); setBeforeFrameCutIndex(null); }}
                className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-muted"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
              {/* 생성된 직전 프레임 */}
              <div className="flex flex-col items-center gap-1">
                <div className="relative w-20 h-28 rounded border overflow-hidden">
                  <img src={beforeFrameUrl} alt="직전 프레임" className="w-full h-full object-cover" />
                  <span className="absolute top-0.5 left-0.5 text-[8px] px-1 py-0.5 rounded bg-primary text-primary-foreground font-medium">
                    AI 생성
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">START</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {/* 원본 컷 */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-28 rounded border overflow-hidden">
                  <img
                    src={cuts.find(c => c.order_index === beforeFrameCutIndex)?.file_path || ''}
                    alt={`컷 ${beforeFrameCutIndex}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">END (컷 {beforeFrameCutIndex})</span>
              </div>
              <span className="ml-2 text-xs text-muted-foreground">
                직전 프레임이 시작 이미지로, 원본 컷이 끝 이미지로 사용됩니다
              </span>
            </div>
          )}
        </div>
      )}

      {/* 프롬프트 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">프롬프트</label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGeneratePrompt}
            disabled={generatingPrompt || !selectedCuts.length}
            className="h-7 text-xs"
          >
            {generatingPrompt ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            AI 생성
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="영상 생성 프롬프트..."
          rows={3}
          className="text-sm"
        />
      </div>

      {/* 설정 (길이 + 비율) — 인라인 칩 */}
      <div className="flex gap-4 flex-wrap">
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">길이</label>
          <div className="flex gap-1">
            {currentProvider?.durations.map((d) => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md border transition-all',
                  duration === d
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                )}
              >
                {d}초
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">비율</label>
          <div className="flex gap-1">
            {currentProvider?.aspectRatios.map((ar) => (
              <button
                key={ar}
                onClick={() => setAspectRatio(ar)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md border transition-all',
                  aspectRatio === ar
                    ? 'border-primary bg-primary/5 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:border-muted-foreground/50'
                )}
              >
                {ar}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 생성 버튼 */}
      <Button
        onClick={handleGenerate}
        disabled={!selectedCuts.length || !selectedProvider}
        className="w-full"
        size="lg"
      >
        <Play className="w-4 h-4 mr-2" />
        {currentProvider?.name || ''} 영상 생성
        {generatingIds.size > 0 && (
          <span className="ml-2 text-xs opacity-70">({generatingIds.size}개 진행중)</span>
        )}
      </Button>

      {/* 결과 갤러리 */}
      {tests.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            결과 ({tests.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tests.map((test) => (
              <VideoTestCard
                key={test.id}
                test={test}
                onDelete={handleDelete}
                onRegenerate={handleRegenerate}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
