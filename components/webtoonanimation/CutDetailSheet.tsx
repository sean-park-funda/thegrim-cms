'use client';

import { useState, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles, Copy, Check, Loader2, ChevronDown, ChevronUp,
  Image as ImageIcon, Film, RefreshCw,
} from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';

const FRAME_STRATEGIES = [
  { value: 'enter', label: '등장 — 빈 배경 → 캐릭터' },
  { value: 'exit', label: '퇴장 — 전체 인물 → 일부 퇴장 ⚠️ 프레임 역할 자동 반전' },
  { value: 'expression', label: '표정 변화 — 감정 변화 클로즈업' },
  { value: 'empty_to_action', label: '빈 배경 → 액션' },
];

const PROMPT_FIELDS = [
  { key: 'gemini_colorize_prompt', label: '① 컬러화', desc: '라인아트 → 컬러' },
  { key: 'gemini_expand_prompt', label: '② 16:9 확장', desc: '컬러 → End Frame' },
  { key: 'gemini_start_frame_prompt', label: '③ Start Frame', desc: 'End Frame → Start Frame' },
  { key: 'video_prompt', label: '④ 영상', desc: 'Start+End → 영상' },
] as const;

type PromptKey = typeof PROMPT_FIELDS[number]['key'];

interface CutDetailSheetProps {
  cut: WebtoonAnimationCut | null;
  project: WebtoonAnimationProject | null;
  open: boolean;
  onClose: () => void;
  onCutUpdated: (updated: WebtoonAnimationCut) => void;
}

export function CutDetailSheet({ cut, project, open, onClose, onCutUpdated }: CutDetailSheetProps) {
  const [synopsis, setSynopsis] = useState('');
  const [frameStrategy, setFrameStrategy] = useState('');
  const [prompts, setPrompts] = useState<Record<PromptKey, string>>({
    gemini_colorize_prompt: '',
    gemini_expand_prompt: '',
    gemini_start_frame_prompt: '',
    video_prompt: '',
  });
  const [generating, setGenerating] = useState(false);
  const [generatingFrames, setGeneratingFrames] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [showFrames, setShowFrames] = useState(false);

  // 프레임 / 영상 URL (로컬 상태 — DB와 동기화)
  const [colorUrl, setColorUrl] = useState<string | null>(null);
  const [startFrameUrl, setStartFrameUrl] = useState<string | null>(null);
  const [endFrameUrl, setEndFrameUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prevCutId = useRef<string | null>(null);

  // cut이 바뀌면 상태 동기화
  if (cut && cut.id !== prevCutId.current) {
    prevCutId.current = cut.id;
    setSynopsis(cut.cut_synopsis || '');
    setFrameStrategy(cut.frame_strategy || '');
    setPrompts({
      gemini_colorize_prompt: cut.gemini_colorize_prompt || '',
      gemini_expand_prompt: cut.gemini_expand_prompt || '',
      gemini_start_frame_prompt: cut.gemini_start_frame_prompt || '',
      video_prompt: cut.video_prompt || '',
    });
    setColorUrl(cut.color_image_url || null);
    setStartFrameUrl(cut.start_frame_url || null);
    setEndFrameUrl(cut.end_frame_url || null);
    setVideoUrl(cut.comfyui_video_url || null);
    const hasPrompts = !!(cut.gemini_colorize_prompt || cut.video_prompt);
    setShowPrompts(hasPrompts);
    setShowFrames(!!(cut.start_frame_url || cut.end_frame_url));
  }

  const saveField = useCallback((field: string, value: string) => {
    if (!cut) return;
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, field, value }),
      });
    }, 800);
  }, [cut]);

  const handleSynopsisChange = (v: string) => {
    setSynopsis(v);
    saveField('cut_synopsis', v);
  };

  const handleStrategyChange = (v: string) => {
    setFrameStrategy(v);
    saveField('frame_strategy', v);
    if (cut) onCutUpdated({ ...cut, frame_strategy: v });
  };

  const handlePromptChange = (key: PromptKey, value: string) => {
    setPrompts((prev) => ({ ...prev, [key]: value }));
    saveField(key, value);
  };

  // ── 4종 프롬프트 자동 생성 ──
  const handleGeneratePrompts = async () => {
    if (!cut || !synopsis.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id,
          cutSynopsis: synopsis,
          frameStrategy: frameStrategy || undefined,
          characterSettings: project?.character_settings || undefined,
        }),
      });
      const data = await res.json();
      if (data.prompts) {
        const next = {
          gemini_colorize_prompt: data.prompts.gemini_colorize || '',
          gemini_expand_prompt: data.prompts.gemini_expand || '',
          gemini_start_frame_prompt: data.prompts.gemini_start_frame || '',
          video_prompt: data.prompts.video_prompt || '',
        };
        setPrompts(next);
        setShowPrompts(true);
        onCutUpdated({ ...cut, cut_synopsis: synopsis, frame_strategy: frameStrategy || null, ...next });
      }
    } finally {
      setGenerating(false);
    }
  };

  // ── Phase A: Gemini 3단계 프레임 생성 ──
  const handleGenerateFrames = async () => {
    if (!cut) return;
    if (!prompts.gemini_colorize_prompt || !prompts.gemini_expand_prompt || !prompts.gemini_start_frame_prompt) {
      alert('먼저 4종 프롬프트를 생성해주세요.');
      return;
    }
    setGeneratingFrames(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColorUrl(data.color_image_url);
      setStartFrameUrl(data.start_frame_url);
      setEndFrameUrl(data.end_frame_url);
      setShowFrames(true);
      onCutUpdated({
        ...cut,
        color_image_url: data.color_image_url,
        start_frame_url: data.start_frame_url,
        end_frame_url: data.end_frame_url,
      });
      if (data.swapped) alert('퇴장 컷: Start/End 프레임 역할이 자동으로 반전되었습니다.');
    } catch (e) {
      alert(`프레임 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingFrames(false);
    }
  };

  // ── Phase B: ComfyUI Wan 2.2 영상 생성 ──
  const handleGenerateVideo = async () => {
    if (!cut) return;
    if (!startFrameUrl || !endFrameUrl) {
      alert('먼저 프레임을 생성해주세요.');
      return;
    }
    if (!prompts.video_prompt) {
      alert('영상 프롬프트를 작성해주세요.');
      return;
    }
    setGeneratingVideo(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-comfyui-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoUrl(data.video_url);
      onCutUpdated({ ...cut, comfyui_video_url: data.video_url });
    } catch (e) {
      alert(`영상 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingVideo(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  if (!cut) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">컷 {cut.order_index} — 기획 & 프롬프트</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-5 py-4">
          {/* 컷 이미지 */}
          <img
            src={cut.file_path}
            alt={cut.file_name}
            className="w-full max-h-52 object-contain rounded-lg border bg-muted"
          />

          {/* 컷 유형 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">컷 유형</Label>
            <Select value={frameStrategy} onValueChange={handleStrategyChange}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {FRAME_STRATEGIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 기획 메모 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">기획 메모</Label>
            <Textarea
              value={synopsis}
              onChange={(e) => handleSynopsisChange(e.target.value)}
              placeholder="예) 복도 등장. 희원이 오른쪽에서 걸어 들어와 중앙에서 멈춘다. 빈 복도, 긴장감."
              className="text-sm resize-none min-h-[70px]"
              rows={3}
            />
          </div>

          {/* Step 1: 4종 프롬프트 생성 */}
          <Button onClick={handleGeneratePrompts} disabled={generating || !synopsis.trim()} className="w-full">
            {generating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />프롬프트 생성 중...</>
              : <><Sparkles className="h-4 w-4 mr-2" />① 4종 프롬프트 자동 생성</>}
          </Button>

          {/* 4종 프롬프트 에디터 */}
          {showPrompts && (
            <div className="space-y-1.5">
              <button
                onClick={() => setShowPrompts((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showPrompts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                4종 프롬프트 편집
              </button>

              <div className="space-y-3 pt-1">
                {PROMPT_FIELDS.map(({ key, label, desc }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{label} <span className="text-muted-foreground font-normal">{desc}</span></span>
                      <button onClick={() => handleCopy(key, prompts[key])} className="text-muted-foreground hover:text-foreground p-0.5">
                        {copied === key ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <Textarea
                      value={prompts[key]}
                      onChange={(e) => handlePromptChange(key, e.target.value)}
                      className="text-xs font-mono resize-none min-h-[72px]"
                      rows={3}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Gemini 프레임 생성 */}
          <div className="border-t pt-4 space-y-3">
            <Button
              onClick={handleGenerateFrames}
              disabled={generatingFrames || !prompts.gemini_colorize_prompt}
              variant="secondary"
              className="w-full"
            >
              {generatingFrames
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gemini 프레임 생성 중... (~90초)</>
                : <><ImageIcon className="h-4 w-4 mr-2" />② Gemini 프레임 생성 (컬러화 → End → Start)</>}
            </Button>

            {/* 프레임 미리보기 */}
            {(colorUrl || startFrameUrl || endFrameUrl) && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowFrames((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
                >
                  {showFrames ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  생성된 프레임 보기
                </button>
                {showFrames && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { url: colorUrl, label: '컬러' },
                      { url: startFrameUrl, label: 'Start' },
                      { url: endFrameUrl, label: 'End' },
                    ].map(({ url, label }) => url && (
                      <div key={label} className="space-y-1">
                        <img src={url} alt={label} className="w-full aspect-video object-cover rounded border" />
                        <p className="text-[10px] text-center text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Wan 2.2 영상 생성 */}
          <div className="border-t pt-4 space-y-3">
            <Button
              onClick={handleGenerateVideo}
              disabled={generatingVideo || !startFrameUrl || !endFrameUrl || !prompts.video_prompt}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            >
              {generatingVideo
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wan 2.2 렌더링 중... (~60초)</>
                : <><Film className="h-4 w-4 mr-2" />③ Wan 2.2 영상 생성 (5090 PC)</>}
            </Button>

            {/* 생성된 영상 */}
            {videoUrl && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-green-600">영상 생성 완료</p>
                  <button
                    onClick={handleGenerateVideo}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> 재생성
                  </button>
                </div>
                <video
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg border"
                  style={{ aspectRatio: '832/480' }}
                />
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline block text-center"
                >
                  새 탭에서 열기
                </a>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
