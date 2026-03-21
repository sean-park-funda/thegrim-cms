'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Sparkles, Copy, Check, Loader2, Film, RefreshCw, Wand2, ImageIcon, Play,
} from 'lucide-react';
import { WebtoonAnimationCut, WebtoonAnimationProject } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type FrameRole = 'start' | 'end' | 'middle';

const FRAME_ROLE_OPTIONS: { value: FrameRole; label: string }[] = [
  { value: 'start', label: '시작' },
  { value: 'end', label: '끝' },
  { value: 'middle', label: '중간 ref' },
];

const FRAME_STRATEGY_OPTIONS = [
  { value: 'enter', label: '등장' },
  { value: 'exit', label: '퇴장' },
  { value: 'expression', label: '표정변화' },
  { value: 'empty_to_action', label: '빈→액션' },
];

interface Props {
  cut: WebtoonAnimationCut;
  project: WebtoonAnimationProject | null;
  onCutUpdated: (updated: WebtoonAnimationCut) => void;
}

function CopyBtn({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (id: string, text: string) => void }) {
  return (
    <button onClick={() => onCopy(id, text)} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0" title="복사">
      {copied === id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** 프롬프트 KO/EN 표시 + 수정 입력창 + 재생성 버튼 */
function PromptPair({
  label, promptKo, promptEn, koField, enField, copied, onCopy,
  onKoChange, onEnChange, onRefine, refining,
}: {
  label?: string;
  promptKo: string; promptEn: string;
  koField: string; enField: string;
  copied: string | null; onCopy: (id: string, text: string) => void;
  onKoChange: (v: string) => void; onEnChange: (v: string) => void;
  onRefine: (instruction: string) => Promise<void>;
  refining: boolean;
}) {
  const [instr, setInstr] = useState('');
  const handleRefine = async () => {
    if (!instr.trim()) return;
    await onRefine(instr);
    setInstr('');
  };

  return (
    <div className="space-y-1.5">
      {label && <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>}
      {/* KO */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-blue-500 font-medium">한국어</span>
          <CopyBtn text={promptKo} id={`${koField}-ko`} copied={copied} onCopy={onCopy} />
        </div>
        <Textarea
          value={promptKo}
          onChange={(e) => onKoChange(e.target.value)}
          placeholder="한국어 설명..."
          className="text-xs resize-none min-h-[52px] border-blue-100 focus-visible:ring-blue-200"
          rows={2}
        />
      </div>
      {/* EN */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">English</span>
          <CopyBtn text={promptEn} id={`${enField}-en`} copied={copied} onCopy={onCopy} />
        </div>
        <Textarea
          value={promptEn}
          onChange={(e) => onEnChange(e.target.value)}
          placeholder="English prompt..."
          className="text-xs font-mono resize-none min-h-[52px]"
          rows={2}
        />
      </div>
      {/* 수정 입력 + 버튼 */}
      <div className="flex gap-1.5">
        <Textarea
          value={instr}
          onChange={(e) => setInstr(e.target.value)}
          placeholder="수정 지시 (예: 밝은 분위기로, 카메라 줌인 추가)"
          className="text-xs resize-none min-h-[36px] flex-1"
          rows={1}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
        />
        <Button
          onClick={handleRefine}
          disabled={refining || !instr.trim()}
          variant="outline" size="sm"
          className="shrink-0 h-9 px-2.5"
          title="AI로 프롬프트 수정"
        >
          {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/** 스텝 카드: 이미지/영상 결과(좌) + 프롬프트+버튼(우) */
function StepCard({
  stepNum, title, resultSlot, promptSlot, actionSlot, disabled,
}: {
  stepNum: number; title: string;
  resultSlot: React.ReactNode;
  promptSlot: React.ReactNode;
  actionSlot: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', disabled && 'opacity-50 pointer-events-none')}>
      <div className="px-3 py-1.5 bg-muted/30 border-b flex items-center gap-2">
        <span className="text-[11px] font-bold text-muted-foreground">STEP {stepNum}</span>
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="grid grid-cols-[180px_1fr] divide-x">
        {/* 좌: 결과 이미지/영상 */}
        <div className="p-2.5 flex items-start justify-center bg-muted/10">
          {resultSlot}
        </div>
        {/* 우: 프롬프트 + 액션 */}
        <div className="p-3 space-y-3">
          {promptSlot}
          {actionSlot}
        </div>
      </div>
    </div>
  );
}

/** 결과 없을 때 빈 박스 */
function EmptyResult({ label }: { label: string }) {
  return (
    <div className="w-full aspect-video border-2 border-dashed border-muted-foreground/20 rounded flex items-center justify-center">
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Wan22CutCard({ cut, project, onCutUpdated }: Props) {
  const [synopsis, setSynopsis] = useState(cut.cut_synopsis || '');
  const [frameRole, setFrameRole] = useState<FrameRole>((cut.frame_role as FrameRole) || 'end');
  const [frameStrategy, setFrameStrategy] = useState(cut.frame_strategy || '');
  const [useColorize, setUseColorize] = useState(cut.use_colorize !== false);

  // 프롬프트 상태 (EN + KO 쌍)
  const [colorizeEn, setColorizeEn] = useState(cut.gemini_colorize_prompt || '');
  const [colorizeKo, setColorizeKo] = useState(cut.gemini_colorize_prompt_ko || '');
  const [expandEn, setExpandEn] = useState(cut.gemini_expand_prompt || '');
  const [expandKo, setExpandKo] = useState(cut.gemini_expand_prompt_ko || '');
  const [otherEn, setOtherEn] = useState(cut.gemini_start_frame_prompt || '');
  const [otherKo, setOtherKo] = useState(cut.gemini_other_frame_prompt_ko || '');
  const [videoEn, setVideoEn] = useState(cut.video_prompt || '');
  const [videoKo, setVideoKo] = useState(cut.video_prompt_ko || '');

  // 결과 이미지/영상
  const [colorUrl, setColorUrl] = useState<string | null>(cut.color_image_url || null);
  const [anchorUrl, setAnchorUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.start_frame_url : cut.end_frame_url) || null
  );
  const [otherUrl, setOtherUrl] = useState<string | null>(
    (cut.frame_role === 'start' ? cut.end_frame_url : cut.start_frame_url) || null
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(cut.comfyui_video_url || null);

  // 로딩 상태
  const [genPrompts, setGenPrompts] = useState(false);
  const [genColorize, setGenColorize] = useState(false);
  const [genAnchor, setGenAnchor] = useState(false);
  const [genOther, setGenOther] = useState(false);
  const [genVideo, setGenVideo] = useState(false);
  const [refiningType, setRefiningType] = useState<string | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const save = useCallback((field: string, value: string | boolean) => {
    clearTimeout(saveTimers.current[field]);
    saveTimers.current[field] = setTimeout(async () => {
      await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, field, value }),
      });
    }, 600);
  }, [cut.id]);

  const update = useCallback((patch: Partial<WebtoonAnimationCut>) => {
    onCutUpdated({ ...cut, ...patch });
  }, [cut, onCutUpdated]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  // ── 전체 프롬프트 자동 생성 ──
  const handleGeneratePrompts = async () => {
    if (!synopsis.trim()) return;
    setGenPrompts(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-cut-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cutId: cut.id, cutSynopsis: synopsis,
          frameRole, frameStrategy: frameStrategy || undefined,
          useColorize, characterSettings: project?.character_settings || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const p = data.prompts;
      setColorizeEn(p.gemini_colorize || '');
      setColorizeKo(p.gemini_colorize_ko || '');
      setExpandEn(p.gemini_expand || '');
      setExpandKo(p.gemini_expand_ko || '');
      setOtherEn(p.gemini_other_frame || '');
      setOtherKo(p.gemini_other_frame_ko || '');
      setVideoEn(p.video_prompt || '');
      setVideoKo(p.video_prompt_ko || '');
      update({
        cut_synopsis: synopsis, frame_role: frameRole,
        frame_strategy: frameStrategy || null, use_colorize: useColorize,
        gemini_colorize_prompt: p.gemini_colorize || null,
        gemini_colorize_prompt_ko: p.gemini_colorize_ko || null,
        gemini_expand_prompt: p.gemini_expand || null,
        gemini_expand_prompt_ko: p.gemini_expand_ko || null,
        gemini_start_frame_prompt: p.gemini_other_frame || null,
        gemini_other_frame_prompt_ko: p.gemini_other_frame_ko || null,
        video_prompt: p.video_prompt || null,
        video_prompt_ko: p.video_prompt_ko || null,
      });
    } catch (e) { alert(`프롬프트 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenPrompts(false); }
  };

  // ── 개별 프롬프트 AI 수정 ──
  const handleRefinePrompt = async (promptType: string, instruction: string, currentEn: string, currentKo: string) => {
    setRefiningType(promptType);
    try {
      const res = await fetch('/api/webtoonanimation/refine-frame-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, promptType, instruction, currentEn, currentKo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (promptType === 'colorize') { setColorizeEn(data.prompt_en); setColorizeKo(data.prompt_ko); update({ gemini_colorize_prompt: data.prompt_en, gemini_colorize_prompt_ko: data.prompt_ko }); }
      if (promptType === 'expand')   { setExpandEn(data.prompt_en);   setExpandKo(data.prompt_ko);   update({ gemini_expand_prompt: data.prompt_en,    gemini_expand_prompt_ko: data.prompt_ko }); }
      if (promptType === 'other_frame') { setOtherEn(data.prompt_en); setOtherKo(data.prompt_ko);    update({ gemini_start_frame_prompt: data.prompt_en, gemini_other_frame_prompt_ko: data.prompt_ko }); }
      if (promptType === 'video')    { setVideoEn(data.prompt_en);    setVideoKo(data.prompt_ko);    update({ video_prompt: data.prompt_en, video_prompt_ko: data.prompt_ko }); }
    } catch (e) { alert(`프롬프트 수정 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setRefiningType(null); }
  };

  // ── 컬러화 단독 재생성 ──
  const handleGenColorize = async () => {
    setGenColorize(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'colorize' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.color_image_url) {
        setColorUrl(data.color_image_url);
        update({ color_image_url: data.color_image_url });
      }
    } catch (e) { alert(`컬러화 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenColorize(false); }
  };

  // ── 앵커 프레임 생성 ──
  const handleGenAnchor = async () => {
    setGenAnchor(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'anchor' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.color_image_url) setColorUrl(data.color_image_url);
      const a = frameRole === 'start' ? data.start_frame_url : data.end_frame_url;
      if (a) setAnchorUrl(a);
      update({
        color_image_url: data.color_image_url || cut.color_image_url,
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`앵커 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenAnchor(false); }
  };

  // ── 나머지 프레임 생성 ──
  const handleGenOther = async () => {
    setGenOther(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id, step: 'other' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const o = frameRole === 'start' ? data.end_frame_url : data.start_frame_url;
      if (o) setOtherUrl(o);
      update({
        start_frame_url: data.start_frame_url || cut.start_frame_url,
        end_frame_url: data.end_frame_url || cut.end_frame_url,
      });
    } catch (e) { alert(`나머지 프레임 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenOther(false); }
  };

  // ── 영상 생성 ──
  const handleGenVideo = async () => {
    setGenVideo(true);
    try {
      const res = await fetch('/api/webtoonanimation/generate-comfyui-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutId: cut.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.polling) {
        const startTime = Date.now();
        while (Date.now() - startTime < 5 * 60 * 1000) {
          await new Promise((r) => setTimeout(r, 10000));
          const pollRes = await fetch(`/api/webtoonanimation/cuts/${cut.id}`);
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.comfyui_video_url) {
              setVideoUrl(pollData.comfyui_video_url);
              update({ comfyui_video_url: pollData.comfyui_video_url });
              return;
            }
          }
        }
        throw new Error('영상 생성 타임아웃 (5분)');
      } else {
        setVideoUrl(data.video_url);
        update({ comfyui_video_url: data.video_url });
      }
    } catch (e) { alert(`영상 생성 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setGenVideo(false); }
  };

  const hasAnchor = !!anchorUrl;
  const hasOther = frameRole === 'middle' || !!otherUrl;
  const canVideo = frameRole === 'middle' ? !!anchorUrl : (!!anchorUrl && !!otherUrl);
  const displayStart = frameRole === 'start' ? anchorUrl : otherUrl;
  const displayEnd = frameRole === 'middle' ? anchorUrl : (frameRole === 'start' ? otherUrl : anchorUrl);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">

      {/* ── 헤더: 원본 + 설정 ── */}
      <div className="grid grid-cols-[200px_1fr] divide-x border-b">
        {/* 원본 이미지 */}
        <div className="p-3 bg-muted/10">
          <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">CUT {cut.order_index + 1} 원본</p>
          <img src={cut.file_path} alt="원본" className="w-full aspect-video object-cover rounded border" />
          {videoUrl && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-green-600 font-medium">
              <Play className="h-3 w-3" />영상 완료
            </div>
          )}
        </div>

        {/* 설정 + 프롬프트 생성 */}
        <div className="p-3 space-y-3">
          {/* 연출 설명 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">연출 설명</Label>
            <Textarea
              value={synopsis}
              onChange={(e) => { setSynopsis(e.target.value); save('cut_synopsis', e.target.value); }}
              placeholder="이 컷에서 일어나는 일을 설명해주세요"
              className="text-sm resize-none min-h-[56px]"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* 역할 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">이 컷의 역할</Label>
              <div className="flex gap-1">
                {FRAME_ROLE_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setFrameRole(opt.value); save('frame_role', opt.value); }}
                    className={cn(
                      'text-xs py-1 px-2.5 rounded border transition-colors',
                      frameRole === opt.value
                        ? 'border-primary bg-primary/5 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground text-muted-foreground'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            {/* 컬러화 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">컬러화</Label>
              <div className="flex items-center gap-1.5 h-8">
                <Switch checked={useColorize} onCheckedChange={(v) => { setUseColorize(v); save('use_colorize', v); }} />
                <span className="text-xs text-muted-foreground">{useColorize ? 'ON' : 'OFF'}</span>
              </div>
            </div>
            {/* 씬 유형 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">씬 유형</Label>
              <Select value={frameStrategy} onValueChange={(v) => { setFrameStrategy(v); save('frame_strategy', v); }}>
                <SelectTrigger className="text-xs h-8 w-28">
                  <SelectValue placeholder="선택사항" />
                </SelectTrigger>
                <SelectContent>
                  {FRAME_STRATEGY_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 자동 생성 버튼 */}
            <div className="ml-auto">
              <Button onClick={handleGeneratePrompts} disabled={genPrompts || !synopsis.trim()} size="sm">
                {genPrompts
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                  : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />전체 프롬프트 자동 생성</>}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 스텝 카드들 ── */}
      <div className="p-3 space-y-3">

        {/* STEP 1: 컬러화 */}
        {useColorize && (
          <StepCard
            stepNum={1} title="컬러화"
            resultSlot={
              colorUrl
                ? <img src={colorUrl} alt="컬러" className="w-full rounded border" />
                : <EmptyResult label="아직 생성 안됨" />
            }
            promptSlot={
              <PromptPair
                promptKo={colorizeKo} promptEn={colorizeEn}
                koField="gemini_colorize_prompt_ko" enField="gemini_colorize_prompt"
                copied={copied} onCopy={handleCopy}
                onKoChange={(v) => { setColorizeKo(v); save('gemini_colorize_prompt_ko', v); }}
                onEnChange={(v) => { setColorizeEn(v); save('gemini_colorize_prompt', v); }}
                onRefine={(instr) => handleRefinePrompt('colorize', instr, colorizeEn, colorizeKo)}
                refining={refiningType === 'colorize'}
              />
            }
            actionSlot={
              <Button
                onClick={handleGenColorize}
                disabled={genColorize || !colorizeEn}
                variant={colorUrl ? 'outline' : 'default'}
                size="sm" className="w-full"
              >
                {genColorize
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                  : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{colorUrl ? '컬러화 재생성' : '컬러화 생성'}</>}
              </Button>
            }
          />
        )}

        {/* STEP 2: 앵커 프레임 */}
        <StepCard
          stepNum={useColorize ? 2 : 1} title={`앵커 프레임 (${frameRole === 'start' ? '시작' : frameRole === 'end' ? '끝' : '레퍼런스'}) — 16:9 확장`}
          resultSlot={
            anchorUrl
              ? <img src={anchorUrl} alt="앵커" className="w-full rounded border" />
              : <EmptyResult label="아직 생성 안됨" />
          }
          promptSlot={
            <PromptPair
              promptKo={expandKo} promptEn={expandEn}
              koField="gemini_expand_prompt_ko" enField="gemini_expand_prompt"
              copied={copied} onCopy={handleCopy}
              onKoChange={(v) => { setExpandKo(v); save('gemini_expand_prompt_ko', v); }}
              onEnChange={(v) => { setExpandEn(v); save('gemini_expand_prompt', v); }}
              onRefine={(instr) => handleRefinePrompt('expand', instr, expandEn, expandKo)}
              refining={refiningType === 'expand'}
            />
          }
          actionSlot={
            <Button
              onClick={handleGenAnchor}
              disabled={genAnchor || !expandEn}
              variant={hasAnchor ? 'outline' : 'default'}
              size="sm" className="w-full"
            >
              {genAnchor
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{hasAnchor ? '앵커 재생성' : '① 앵커 프레임 생성'}</>}
            </Button>
          }
        />

        {/* STEP 3: 나머지 프레임 */}
        {frameRole !== 'middle' && (
          <StepCard
            stepNum={useColorize ? 3 : 2} title={`${frameRole === 'start' ? '끝' : '시작'} 프레임 생성`}
            disabled={!hasAnchor}
            resultSlot={
              otherUrl
                ? <img src={otherUrl} alt="나머지 프레임" className="w-full rounded border" />
                : <EmptyResult label={hasAnchor ? '아직 생성 안됨' : '앵커 먼저 생성'} />
            }
            promptSlot={
              <PromptPair
                promptKo={otherKo} promptEn={otherEn}
                koField="gemini_other_frame_prompt_ko" enField="gemini_start_frame_prompt"
                copied={copied} onCopy={handleCopy}
                onKoChange={(v) => { setOtherKo(v); save('gemini_other_frame_prompt_ko', v); }}
                onEnChange={(v) => { setOtherEn(v); save('gemini_start_frame_prompt', v); }}
                onRefine={(instr) => handleRefinePrompt('other_frame', instr, otherEn, otherKo)}
                refining={refiningType === 'other_frame'}
              />
            }
            actionSlot={
              <Button
                onClick={handleGenOther}
                disabled={genOther || !hasAnchor || !otherEn}
                variant={hasOther ? 'outline' : 'default'}
                size="sm" className="w-full"
              >
                {genOther
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                  : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />{hasOther ? '나머지 재생성' : `② ${frameRole === 'start' ? '끝' : '시작'} 프레임 생성`}</>}
              </Button>
            }
          />
        )}

        {/* STEP 4: 영상 */}
        <StepCard
          stepNum={frameRole === 'middle' ? (useColorize ? 3 : 2) : (useColorize ? 4 : 3)}
          title="영상 생성 (Wan 2.2 / 5090 PC)"
          disabled={!canVideo}
          resultSlot={
            videoUrl
              ? (
                <div className="w-full space-y-1">
                  <video src={videoUrl} controls className="w-full rounded border" style={{ aspectRatio: '832/480' }} />
                  <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline block text-center">새 탭</a>
                </div>
              )
              : <EmptyResult label={canVideo ? '아직 생성 안됨' : '프레임 먼저 생성'} />
          }
          promptSlot={
            <PromptPair
              promptKo={videoKo} promptEn={videoEn}
              koField="video_prompt_ko" enField="video_prompt"
              copied={copied} onCopy={handleCopy}
              onKoChange={(v) => { setVideoKo(v); save('video_prompt_ko', v); }}
              onEnChange={(v) => { setVideoEn(v); save('video_prompt', v); }}
              onRefine={(instr) => handleRefinePrompt('video', instr, videoEn, videoKo)}
              refining={refiningType === 'video'}
            />
          }
          actionSlot={
            <Button
              onClick={handleGenVideo}
              disabled={genVideo || !canVideo || !videoEn}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              size="sm"
            >
              {genVideo
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Wan 2.2 렌더링 중... (~1분)</>
                : <><Film className="h-3.5 w-3.5 mr-1.5" />{videoUrl ? '영상 재생성' : '③ 영상 생성'}</>}
            </Button>
          }
        />

      </div>
    </div>
  );
}
