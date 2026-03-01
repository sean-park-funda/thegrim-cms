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
import { Play, Sparkles, Loader2 } from 'lucide-react';
import type { WebtoonAnimationCut, WebtoonAnimationVideoTest } from '@/lib/supabase';
import type { ProviderCapabilities, InputMode } from '@/lib/video-generation/providers';
import { CutPicker } from './CutPicker';
import { VideoTestCard } from './VideoTestCard';

interface VideoTestLabProps {
  cuts: WebtoonAnimationCut[];
  projectId: string;
  rangeStart: number;
  rangeEnd: number;
}

const INPUT_MODE_LABELS: Record<InputMode, string> = {
  single_image: '단일 이미지',
  start_end_frame: '시작+끝 프레임',
  multi_reference: '다중 레퍼런스',
};

const SAFETY_BADGE: Record<string, { label: string; class: string }> = {
  lenient: { label: '관대', class: 'bg-green-100 text-green-800' },
  moderate: { label: '보통', class: 'bg-yellow-100 text-yellow-800' },
  strict: { label: '엄격', class: 'bg-red-100 text-red-800' },
};

export function VideoTestLab({ cuts, projectId, rangeStart, rangeEnd }: VideoTestLabProps) {
  const [providers, setProviders] = useState<ProviderCapabilities[]>([]);
  const [tests, setTests] = useState<WebtoonAnimationVideoTest[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [inputMode, setInputMode] = useState<InputMode>('single_image');
  const [selectedCuts, setSelectedCuts] = useState<number[]>([]);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [generating, setGenerating] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  const currentProvider = providers.find((p) => p.id === selectedProvider);

  // Load providers + test history
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

  // Provider 변경 시 입력모드 자동 설정
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

  // AI 프롬프트 생성
  const handleGeneratePrompt = async () => {
    if (!selectedCuts.length) return;
    setGeneratingPrompt(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-test-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          cutIndices: selectedCuts,
          inputMode,
          provider: selectedProvider,
          duration,
        }),
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

  // 영상 생성
  const handleGenerate = async () => {
    if (!selectedCuts.length || !selectedProvider) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-test-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          provider: selectedProvider,
          inputMode,
          cutIndices: selectedCuts,
          prompt,
          duration,
          aspectRatio,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setTests((prev) => [data, ...prev]);
      }
    } catch (e) {
      console.error(e);
      alert('영상 생성 실패');
    } finally {
      setGenerating(false);
    }
  };

  // 삭제
  const handleDelete = async (testId: string) => {
    await fetch(`/api/webtoonanimation/video-tests?testId=${testId}`, { method: 'DELETE' });
    setTests((prev) => prev.filter((t) => t.id !== testId));
  };

  // 재생성
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
    <div className="space-y-4">
      {/* 모델 + 입력모드 선택 */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-medium mb-1 block">모델</label>
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger>
              <SelectValue placeholder="모델 선택" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => {
                const safety = SAFETY_BADGE[p.contentSafety];
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <span>{p.name}</span>
                      <span className={`text-[10px] px-1 py-0.5 rounded ${safety.class}`}>
                        {safety.label}
                      </span>
                      {p.costPerSec !== undefined && (
                        <span className="text-[10px] text-muted-foreground">
                          {p.costPerSec === 0 ? '무료' : `$${p.costPerSec}/s`}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[160px]">
          <label className="text-xs font-medium mb-1 block">입력 모드</label>
          <Select
            value={inputMode}
            onValueChange={(v) => { setInputMode(v as InputMode); setSelectedCuts([]); }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProvider?.inputModes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {INPUT_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[80px]">
          <label className="text-xs font-medium mb-1 block">길이</label>
          <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProvider?.durations.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}초
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[80px]">
          <label className="text-xs font-medium mb-1 block">비율</label>
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currentProvider?.aspectRatios.map((ar) => (
                <SelectItem key={ar} value={ar}>
                  {ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 컷 선택 */}
      <CutPicker
        cuts={cuts}
        inputMode={inputMode}
        maxImages={currentProvider?.maxImages || 4}
        selectedIndices={selectedCuts}
        onSelectionChange={setSelectedCuts}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />

      {/* 프롬프트 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium">프롬프트</label>
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

      {/* 생성 버튼 */}
      <Button
        onClick={handleGenerate}
        disabled={generating || !selectedCuts.length || !selectedProvider}
        className="w-full"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Play className="w-4 h-4 mr-2" />
        )}
        {generating ? '생성 중...' : '영상 생성'}
      </Button>

      {/* 결과 갤러리 */}
      {tests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">결과 ({tests.length})</h3>
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
