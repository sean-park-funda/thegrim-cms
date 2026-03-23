'use client';

import { useState, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles, Copy, Check, Loader2, ChevronDown, ChevronUp,
  Film, RefreshCw, Wand2, ImageIcon, Play,
} from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type FrameRole = 'start' | 'end' | 'middle';

const FRAME_ROLE_OPTIONS: { value: FrameRole; label: string; desc: string }[] = [
  { value: 'start', label: '시작 프레임', desc: '이 컷 → 시작, 끝 프레임 생성' },
  { value: 'end', label: '끝 프레임', desc: '이 컷 → 끝, 시작 프레임 생성' },
  { value: 'middle', label: '중간 레퍼런스', desc: '단독 이미지로 영상 생성' },
];

const FRAME_STRATEGY_OPTIONS = [
  { value: 'enter', label: '등장 — 빈 배경 → 캐릭터' },
  { value: 'exit', label: '퇴장 — 전체 인물 → 일부 퇴장' },
  { value: 'expression', label: '표정 변화 — 감정 클로즈업' },
  { value: 'empty_to_action', label: '빈 배경 → 액션' },
];

interface CutDetailSheetProps {
  cut: WebtoonAnimationCut | null;
  project: WebtoonAnimationProject | null;
  open: boolean;
  onClose: () => void;
  onCutUpdated: (updated: WebtoonAnimationCut) => void;
}

// ── 섹션 래퍼 ──
function Section({ step, title, children, complete }: {
  step?: string; title: string; children: React.ReactNode; complete?: boolean;
}) {
  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3 transition-colors',
      complete ? 'border-green-200 bg-green-50/30' : 'border-border bg-background'
    )}>
      <div className="flex items-center gap-2">
        {step && (
          <span className={cn(
            'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            complete ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
          )}>
            {step}
          </span>
        )}
        <p className="text-sm font-semibold">{title}</p>
        {complete && <span className="text-[10px] text-green-600 ml-auto">✓ 완료</span>}
      </div>
      {children}
    </div>
  );
}

// ── 프롬프트 에디터 블록 ──
function PromptBlock({ label, value, onChange, onCopy, copied, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void;
  onCopy: () => void; copied: boolean; placeholder?: string; rows?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <button onClick={onCopy} className="text-muted-foreground hover:text-foreground p-0.5">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs font-mono resize-none"
        rows={rows}
      />
    </div>
  );
}

// ── 수정 지시사항 블록 ──
function InstructionBlock({ value, onChange, onSubmit, loading, submitLabel, placeholder }: {
  value: string; onChange: (v: string) => void;
  onSubmit: () => void; loading: boolean; submitLabel: string; placeholder?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3 border border-dashed border-muted-foreground/30">
      <Label className="text-xs text-muted-foreground">수정 지시사항</Label>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '수정할 내용을 입력하세요...'}
        className="text-sm resize-none min-h-[52px]"
        rows={2}
      />
      <Button
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        variant="outline"
        size="sm"
        className="w-full"
      >
        {loading
          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />처리 중...</>
          : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />{submitLabel}</>}
      </Button>
    </div>
  );
}

export function CutDetailSheet({ cut, project, open, onClose, onCutUpdated }: CutDetailSheetProps) {
  // ── 입력 상태 ──
  const [synopsis, setSynopsis] = useState('');
  const [frameRole, setFrameRole] = useState<FrameRole>('end');
  const [frameStrategy, setFrameStrategy] = useState('');
  const [useColorize, setUseColorize] = useState(true);

  // ── 프롬프트 상태 ──
  const [colorizePrompt, setColorizePrompt] = useState('');
  const [expandPrompt, setExpandPrompt] = useState('');
  const [otherFramePrompt, setOtherFramePrompt] = useState('');
  const [videoPromptEn, setVideoPromptEn] = useState('');
  const [videoPromptKo, setVideoPromptKo] = useState('');

  // ── URL 상태 ──
  const [colorUrl, setColorUrl] = useState<string | null>(null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(null); // start or end depending on role
  const [otherUrl, setOtherUrl] = useState<string | null>(null);   // the generated other frame
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // ── 로딩 상태 ──
  const [generatingPrompts, setGeneratingPrompts] = useState(false);
  const [generatingAnchor, setGeneratingAnchor] = useState(false);
  const [generatingOther, setGeneratingOther] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [refiningPrompt, setRefiningPrompt] = useState(false);

  // ── 접기/펼치기 ──
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showFramePreview, setShowFramePreview] = useState(true);

  // ── 수정 지시사항 ──
  const [anchorInstruction, setAnchorInstruction] = useState('');
  const [otherInstruction, setOtherInstruction] = useState('');
  const [videoInstruction, setVideoInstruction] = useState('');

  const [copied, setCopied] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prevCutId = useRef<string | null>(null);

  // cut 변경 시 동기화
  if (cut && cut.id !== prevCutId.current) {
    prevCutId.current = cut.id;
    const role = (cut.frame_role as FrameRole) || 'end';
    setSynopsis(cut.cut_synopsis || '');
    setFrameRole(role);
    setFrameStrategy(cut.frame_strategy || '');
    setUseColorize(cut.use_colorize !== false);
    setColorizePrompt(cut.gemini_colorize_prompt || '');
    setExpandPrompt(cut.gemini_expand_prompt || '');
    setOtherFramePrompt(cut.gemini_start_frame_prompt || '');
    setVideoPromptEn(cut.video_prompt || '');
    setVideoPromptKo(cut.video_prompt_ko || '');
    setColorUrl(cut.color_image_url || null);
    // anchor = start_frame_url if role='start', end_frame_url otherwise
    setAnchorUrl(role === 'start' ? (cut.start_frame_url || null) : (cut.end_frame_url || null));
    // other = opposite
    setOtherUrl(role === 'start' ? (cut.end_frame_url || null) : (cut.start_frame_url || null));
    setVideoUrl(cut.comfyui_video_url || null);
    setAnchorInstruction('');
    setOtherInstruction('');
    setVideoInstruction('');
    setShowPromptEditor(!!(cut.gemini_colorize_prompt || cut.gemini_expand_prompt));
  }

  const saveField = useCallback((field: string, value: string | boolean) => {
    if (!cut) return;
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, field, value }),
      });
    }, 600);
  }, [cut]);

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const updateCutLocal = useCallback((patch: Partial<WebtoonAnimationCut>) => {
    if (!cut) return;
    onCutUpdated({ ...cut, ...patch });
  }, [cut, onCutUpdated]);

  // ── 프롬프트 자동 생성 ──
  const handleGeneratePrompts = async () => {
    if (!cut || !synopsis.trim()) return;
    setGeneratingPrompts(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id,
          cutSynopsis: synopsis,
          frameRole,
          frameStrategy: frameStrategy || undefined,
          useColorize,
          characterSettings: project?.character_settings || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const p = data.prompts;
      setColorizePrompt(p.gemini_colorize || '');
      setExpandPrompt(p.gemini_expand || '');
      setOtherFramePrompt(p.gemini_other_frame || '');
      setVideoPromptEn(p.video_prompt || '');
      setVideoPromptKo(p.video_prompt_ko || '');
      setShowPromptEditor(true);
      updateCutLocal({
        cut_synopsis: synopsis,
        frame_role: frameRole,
        frame_strategy: frameStrategy || null,
        use_colorize: useColorize,
        gemini_colorize_prompt: p.gemini_colorize || null,
        gemini_expand_prompt: p.gemini_expand || null,
        gemini_start_frame_prompt: p.gemini_other_frame || null,
        video_prompt: p.video_prompt || null,
        video_prompt_ko: p.video_prompt_ko || null,
      });
    } catch (e) {
      alert(`프롬프트 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingPrompts(false);
    }
  };

  // ── 앵커 프레임 생성 ──
  const handleGenerateAnchor = async (instruction?: string) => {
    if (!cut) return;
    setGeneratingAnchor(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'anchor', instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColorUrl(data.color_image_url || colorUrl);
      const newAnchor = frameRole === 'start' ? data.start_frame_url : data.end_frame_url;
      if (newAnchor) setAnchorUrl(newAnchor);
      setAnchorInstruction('');
      setShowFramePreview(true);
      updateCutLocal({
        color_image_url: data.color_image_url || cut.color_image_url,
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) {
      alert(`앵커 프레임 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingAnchor(false);
    }
  };

  // ── 나머지 프레임 생성 ──
  const handleGenerateOther = async (instruction?: string) => {
    if (!cut) return;
    setGeneratingOther(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'other', instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const newOther = frameRole === 'start' ? data.end_frame_url : data.start_frame_url;
      if (newOther) setOtherUrl(newOther);
      setOtherInstruction('');
      updateCutLocal({
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) {
      alert(`나머지 프레임 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingOther(false);
    }
  };

  // ── 영상 프롬프트 AI 개선 ──
  const handleRefineVideoPrompt = async (): Promise<boolean> => {
    if (!cut || !videoInstruction.trim()) return false;
    setRefiningPrompt(true);
    try {
      const res = await fetch('/api/webtoonanimation/refine-video-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id,
          instruction: videoInstruction,
          currentPromptEn: videoPromptEn,
          currentPromptKo: videoPromptKo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setVideoPromptEn(data.video_prompt || '');
      setVideoPromptKo(data.video_prompt_ko || '');
      setVideoInstruction('');
      updateCutLocal({ video_prompt: data.video_prompt, video_prompt_ko: data.video_prompt_ko });
      return true;
    } catch (e) {
      alert(`프롬프트 개선 실패: ${e instanceof Error ? e.message : e}`);
      return false;
    } finally {
      setRefiningPrompt(false);
    }
  };

  // ── 영상 생성 ──
  const handleGenerateVideo = async () => {
    if (!cut) return;
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
      updateCutLocal({ comfyui_video_url: data.video_url });
    } catch (e) {
      alert(`영상 생성 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setGeneratingVideo(false);
    }
  };

  // ── 개선 + 바로 영상 생성 ──
  const handleRefineAndGenerate = async () => {
    const ok = await handleRefineVideoPrompt();
    if (ok) await handleGenerateVideo();
  };

  if (!cut) return null;

  const hasPrompts = !!(expandPrompt);
  const hasAnchor = !!anchorUrl;
  const hasOther = frameRole === 'middle' || !!otherUrl;
  const canGenVideo = frameRole === 'middle' ? !!anchorUrl : (!!anchorUrl && !!otherUrl);

  // 화면에 표시할 Start/End URL
  const displayStartUrl = frameRole === 'start' ? anchorUrl : otherUrl;
  const displayEndUrl = frameRole === 'start' ? otherUrl : frameRole === 'middle' ? anchorUrl : anchorUrl;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
          <SheetTitle className="text-base">컷 {cut.order_index + 1} — 프레임 & 영상 생성</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-4">

          {/* ━━━━ STEP 1: 입력 ━━━━ */}
          <Section step="STEP 1" title="기획 입력" complete={hasPrompts}>
            {/* 컷 이미지 */}
            <img
              src={cut.file_path}
              alt={cut.file_name}
              className="w-full max-h-44 object-contain rounded-lg border bg-muted"
            />

            {/* 연출 설명 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">연출 설명</Label>
              <Textarea
                value={synopsis}
                onChange={(e) => { setSynopsis(e.target.value); saveField('cut_synopsis', e.target.value); }}
                placeholder="예) 희원이 복도 오른쪽에서 걸어 들어와 중앙에서 멈춤. 빈 복도, 긴장감."
                className="text-sm resize-none min-h-[72px]"
                rows={3}
              />
            </div>

            {/* 이 컷의 역할 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">원본컷의 역할</Label>
              <div className="grid grid-cols-3 gap-2">
                {FRAME_ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setFrameRole(opt.value); saveField('frame_role', opt.value); }}
                    className={cn(
                      'rounded-lg border px-2 py-2 text-left transition-colors',
                      frameRole === opt.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-muted-foreground'
                    )}
                  >
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">컬러화</Label>
              <div className="flex items-center gap-1.5 h-8">
                <Switch
                  checked={useColorize}
                  onCheckedChange={(v) => { setUseColorize(v); saveField('use_colorize', v); }}
                />
                <span className="text-xs text-muted-foreground">{useColorize ? '필요' : '스킵'}</span>
              </div>
            </div>

            {/* 프롬프트 자동 생성 버튼 */}
            <Button
              onClick={handleGeneratePrompts}
              disabled={generatingPrompts || !synopsis.trim()}
              className="w-full"
            >
              {generatingPrompts
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />프롬프트 생성 중...</>
                : <><Sparkles className="h-4 w-4 mr-2" />프롬프트 자동 생성</>}
            </Button>

            {/* 프롬프트 편집 (접기/펼치기) */}
            {hasPrompts && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowPromptEditor((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
                >
                  {showPromptEditor ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  이미지 프롬프트 편집
                </button>
                {showPromptEditor && (
                  <div className="space-y-3 pt-1">
                    {useColorize && (
                      <PromptBlock
                        label="컬러화 프롬프트"
                        value={colorizePrompt}
                        onChange={(v) => { setColorizePrompt(v); saveField('gemini_colorize_prompt', v); }}
                        onCopy={() => handleCopy('col', colorizePrompt)}
                        copied={copied === 'col'}
                        placeholder="라인아트 → 컬러 변환 지시..."
                      />
                    )}
                    <PromptBlock
                      label="앵커 프레임 프롬프트 (16:9 확장)"
                      value={expandPrompt}
                      onChange={(v) => { setExpandPrompt(v); saveField('gemini_expand_prompt', v); }}
                      onCopy={() => handleCopy('exp', expandPrompt)}
                      copied={copied === 'exp'}
                      placeholder="16:9 widescreen 확장 지시..."
                    />
                    {frameRole !== 'middle' && (
                      <PromptBlock
                        label={`나머지 프레임 프롬프트 (${frameRole === 'start' ? '끝 프레임' : '시작 프레임'} 생성)`}
                        value={otherFramePrompt}
                        onChange={(v) => { setOtherFramePrompt(v); saveField('gemini_start_frame_prompt', v); }}
                        onCopy={() => handleCopy('oth', otherFramePrompt)}
                        copied={copied === 'oth'}
                        placeholder="나머지 프레임 생성 지시..."
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* ━━━━ STEP 2: 앵커 프레임 ━━━━ */}
          <Section step="STEP 2" title={`앵커 프레임 생성 (이 컷 = ${frameRole === 'start' ? '시작' : frameRole === 'middle' ? '레퍼런스' : '끝'})`} complete={hasAnchor}>
            <Button
              onClick={() => handleGenerateAnchor()}
              disabled={generatingAnchor || !expandPrompt}
              variant={hasAnchor ? 'outline' : 'default'}
              className="w-full"
            >
              {generatingAnchor
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />생성 중... (~90초)</>
                : hasAnchor
                  ? <><RefreshCw className="h-4 w-4 mr-2" />앵커 프레임 재생성</>
                  : <><ImageIcon className="h-4 w-4 mr-2" />앵커 프레임 생성</>}
            </Button>

            {/* 앵커 프리뷰 */}
            {(colorUrl || anchorUrl) && (
              <div className="space-y-1.5">
                <button
                  onClick={() => setShowFramePreview((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full"
                >
                  {showFramePreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  프레임 미리보기
                </button>
                {showFramePreview && (
                  <div className="flex gap-2">
                    {colorUrl && useColorize && (
                      <div className="flex-1 space-y-1">
                        <img src={colorUrl} alt="컬러" className="w-full aspect-video object-cover rounded border" />
                        <p className="text-[10px] text-center text-muted-foreground">컬러화</p>
                      </div>
                    )}
                    {anchorUrl && (
                      <div className="flex-1 space-y-1">
                        <img src={anchorUrl} alt="앵커" className="w-full aspect-video object-cover rounded border" />
                        <p className="text-[10px] text-center text-muted-foreground">
                          앵커 {frameRole === 'start' ? '(시작)' : frameRole === 'middle' ? '(레퍼런스)' : '(끝)'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 앵커 수정 지시사항 */}
            {hasAnchor && (
              <InstructionBlock
                value={anchorInstruction}
                onChange={setAnchorInstruction}
                onSubmit={() => handleGenerateAnchor(anchorInstruction)}
                loading={generatingAnchor}
                submitLabel="수정 후 앵커 재생성"
                placeholder="예) 조명을 더 어둡게, 캐릭터 오른쪽으로 이동..."
              />
            )}
          </Section>

          {/* ━━━━ STEP 3: 나머지 프레임 (middle이면 스킵) ━━━━ */}
          {frameRole !== 'middle' && (
            <Section
              step="STEP 3"
              title={`나머지 프레임 생성 (${frameRole === 'start' ? '끝 프레임' : '시작 프레임'})`}
              complete={!!otherUrl}
            >
              <Button
                onClick={() => handleGenerateOther()}
                disabled={generatingOther || !anchorUrl || !otherFramePrompt}
                variant={otherUrl ? 'outline' : 'default'}
                className="w-full"
              >
                {generatingOther
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />생성 중... (~60초)</>
                  : otherUrl
                    ? <><RefreshCw className="h-4 w-4 mr-2" />나머지 프레임 재생성</>
                    : <><ImageIcon className="h-4 w-4 mr-2" />나머지 프레임 생성</>}
              </Button>

              {otherUrl && (
                <div className="space-y-1">
                  <img src={otherUrl} alt="나머지 프레임" className="w-full aspect-video object-cover rounded border" />
                  <p className="text-[10px] text-center text-muted-foreground">
                    {frameRole === 'start' ? '끝 프레임 (생성됨)' : '시작 프레임 (생성됨)'}
                  </p>
                </div>
              )}

              {otherUrl && (
                <InstructionBlock
                  value={otherInstruction}
                  onChange={setOtherInstruction}
                  onSubmit={() => handleGenerateOther(otherInstruction)}
                  loading={generatingOther}
                  submitLabel="수정 후 나머지 프레임 재생성"
                  placeholder="예) 시작 상태에서 캐릭터가 더 멀리 있어야 해..."
                />
              )}
            </Section>
          )}

          {/* ━━━━ STEP 4: 영상 생성 ━━━━ */}
          <Section step="STEP 4" title="영상 생성" complete={!!videoUrl}>
            {/* Start / End 프레임 나란히 */}
            {canGenVideo && (
              <div className="grid grid-cols-2 gap-2">
                {displayStartUrl && (
                  <div className="space-y-1">
                    <img src={displayStartUrl} alt="Start" className="w-full aspect-video object-cover rounded border" />
                    <p className="text-[10px] text-center text-muted-foreground">Start Frame</p>
                  </div>
                )}
                {displayEndUrl && (
                  <div className="space-y-1">
                    <img src={displayEndUrl} alt="End" className="w-full aspect-video object-cover rounded border" />
                    <p className="text-[10px] text-center text-muted-foreground">
                      {frameRole === 'middle' ? 'End Frame (동일)' : 'End Frame'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 한국어 프롬프트 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-blue-600">영상 프롬프트 (한국어)</Label>
                <button onClick={() => handleCopy('vko', videoPromptKo)} className="text-muted-foreground hover:text-foreground p-0.5">
                  {copied === 'vko' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Textarea
                value={videoPromptKo}
                onChange={(e) => { setVideoPromptKo(e.target.value); saveField('video_prompt_ko', e.target.value); }}
                placeholder="한국어 영상 설명..."
                className="text-xs resize-none min-h-[64px] border-blue-200 focus-visible:ring-blue-300"
                rows={3}
              />
            </div>

            {/* 영어 프롬프트 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">영상 프롬프트 (영어, ComfyUI 입력)</Label>
                <button onClick={() => handleCopy('ven', videoPromptEn)} className="text-muted-foreground hover:text-foreground p-0.5">
                  {copied === 'ven' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Textarea
                value={videoPromptEn}
                onChange={(e) => { setVideoPromptEn(e.target.value); saveField('video_prompt', e.target.value); }}
                placeholder="Anime style, Korean webtoon aesthetic..."
                className="text-xs font-mono resize-none min-h-[80px]"
                rows={3}
              />
            </div>

            {/* 영상 프롬프트 수정 */}
            <div className="space-y-2 rounded-lg bg-muted/40 p-3 border border-dashed border-muted-foreground/30">
              <Label className="text-xs text-muted-foreground">프롬프트 수정 지시사항</Label>
              <Textarea
                value={videoInstruction}
                onChange={(e) => setVideoInstruction(e.target.value)}
                placeholder="예) 카메라를 위에서 아래로, 속도감 더 살려줘..."
                className="text-sm resize-none min-h-[52px]"
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleRefineVideoPrompt}
                  disabled={refiningPrompt || !videoInstruction.trim()}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  {refiningPrompt
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />개선 중...</>
                    : <><Wand2 className="h-3.5 w-3.5 mr-1" />프롬프트만 개선</>}
                </Button>
                <Button
                  onClick={handleRefineAndGenerate}
                  disabled={refiningPrompt || generatingVideo || !videoInstruction.trim() || !canGenVideo || !videoPromptEn}
                  size="sm"
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {refiningPrompt || generatingVideo
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />{refiningPrompt ? '개선 중...' : '렌더링...'}</>
                    : <><Wand2 className="h-3.5 w-3.5 mr-1" />개선 + 영상 생성</>}
                </Button>
              </div>
            </div>

            {/* 영상 생성 버튼 */}
            <Button
              onClick={handleGenerateVideo}
              disabled={generatingVideo || !canGenVideo || !videoPromptEn}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            >
              {generatingVideo
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wan 2.2 렌더링 중... (~60초)</>
                : <><Film className="h-4 w-4 mr-2" />영상 생성 (5090 PC)</>}
            </Button>

            {/* 생성된 영상 */}
            {videoUrl && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Play className="h-3.5 w-3.5 text-green-600" />
                    <p className="text-xs font-medium text-green-600">영상 생성 완료</p>
                  </div>
                  <button
                    onClick={handleGenerateVideo}
                    disabled={generatingVideo}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
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
                <a href={videoUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary underline block text-center">
                  새 탭에서 열기
                </a>
              </div>
            )}
          </Section>

        </div>
      </SheetContent>
    </Sheet>
  );
}
