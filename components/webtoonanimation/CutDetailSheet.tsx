'use client';

import { useState, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Copy, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';

const FRAME_STRATEGIES = [
  { value: 'enter', label: '등장 — 빈 배경 → 캐릭터' },
  { value: 'exit', label: '퇴장 — 전체 인물 → 일부 퇴장' },
  { value: 'expression', label: '표정 변화 — 감정 변화 클로즈업' },
  { value: 'empty_to_action', label: '빈 배경 → 액션' },
];

const PROMPT_FIELDS = [
  { key: 'gemini_colorize_prompt', label: '① 컬러화 프롬프트', desc: '라인아트 → 컬러 이미지' },
  { key: 'gemini_expand_prompt', label: '② 16:9 확장 프롬프트', desc: '컬러 이미지 → End Frame' },
  { key: 'gemini_start_frame_prompt', label: '③ Start Frame 프롬프트', desc: 'End Frame → Start Frame' },
  { key: 'video_prompt', label: '④ 영상 프롬프트', desc: 'Start + End → 영상' },
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
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // cut이 바뀌면 값 동기화
  const prevCutId = useRef<string | null>(null);
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
    setShowPrompts(
      !!(cut.gemini_colorize_prompt || cut.gemini_expand_prompt || cut.gemini_start_frame_prompt || cut.video_prompt)
    );
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

  const handleGenerate = async () => {
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
        setPrompts({
          gemini_colorize_prompt: data.prompts.gemini_colorize || '',
          gemini_expand_prompt: data.prompts.gemini_expand || '',
          gemini_start_frame_prompt: data.prompts.gemini_start_frame || '',
          video_prompt: data.prompts.video_prompt || '',
        });
        setShowPrompts(true);
        onCutUpdated({
          ...cut,
          cut_synopsis: synopsis,
          frame_strategy: frameStrategy || null,
          gemini_colorize_prompt: data.prompts.gemini_colorize,
          gemini_expand_prompt: data.prompts.gemini_expand,
          gemini_start_frame_prompt: data.prompts.gemini_start_frame,
          video_prompt: data.prompts.video_prompt,
        });
      }
    } finally {
      setGenerating(false);
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
            className="w-full max-h-64 object-contain rounded-lg border bg-muted"
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
              className="text-sm resize-none min-h-[80px]"
              rows={3}
            />
          </div>

          {/* 프롬프트 생성 버튼 */}
          <Button
            onClick={handleGenerate}
            disabled={generating || !synopsis.trim()}
            className="w-full"
          >
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />4종 프롬프트 생성 중...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" />4종 프롬프트 자동 생성</>
            )}
          </Button>

          {/* 4종 프롬프트 */}
          {(showPrompts || prompts.gemini_colorize_prompt) && (
            <div className="space-y-1">
              <button
                onClick={() => setShowPrompts((v) => !v)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showPrompts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                4종 프롬프트 {showPrompts ? '접기' : '펼치기'}
              </button>

              {showPrompts && (
                <div className="space-y-4 pt-2">
                  {PROMPT_FIELDS.map(({ key, label, desc }) => (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground ml-1.5">{desc}</span>
                        </div>
                        <button
                          onClick={() => handleCopy(key, prompts[key])}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          {copied === key
                            ? <Check className="h-3.5 w-3.5 text-green-500" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <Textarea
                        value={prompts[key]}
                        onChange={(e) => handlePromptChange(key, e.target.value)}
                        className="text-xs font-mono resize-none min-h-[90px]"
                        rows={4}
                        placeholder={`${label} 프롬프트`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
